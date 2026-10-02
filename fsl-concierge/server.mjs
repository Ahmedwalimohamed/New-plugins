import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const __dirname=dirname(fileURLToPath(import.meta.url));
const html=await readFile(join(__dirname,'index.html'));
const port=Number(process.env.PORT||3000);
const SUPABASE_URL=process.env.SUPABASE_URL||'';
const SUPABASE_KEY=process.env.SUPABASE_KEY||'';
const WORKSPACE_TOKEN=process.env.WORKSPACE_TOKEN||'';
const APP_USERNAME=process.env.APP_USERNAME||'';
const APP_PASSWORD=process.env.APP_PASSWORD||'';
const MAX_FILE_BYTES=15*1024*1024;

function secureEqual(a,b){
  const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b));
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}
function authorized(req){
  if(!APP_USERNAME||!APP_PASSWORD) return false;
  const h=req.headers.authorization||'';
  if(!h.startsWith('Basic ')) return false;
  try{
    const [u,...rest]=Buffer.from(h.slice(6),'base64').toString('utf8').split(':');
    return secureEqual(u,APP_USERNAME)&&secureEqual(rest.join(':'),APP_PASSWORD);
  }catch{return false;}
}
function json(res,status,data){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(data));
}
function authRequired(res){
  res.writeHead(401,{'www-authenticate':'Basic realm="Hibo FSL Concierge"','content-type':'text/plain; charset=utf-8','cache-control':'no-store'});
  res.end('Authentication required');
}
async function readBody(req){
  let raw='';
  for await(const chunk of req){ raw+=chunk; if(raw.length>20000) throw new Error('body too large'); }
  return raw?JSON.parse(raw):{};
}
async function readBuffer(req,maxBytes=MAX_FILE_BYTES){
  const chunks=[]; let total=0;
  for await(const chunk of req){
    total+=chunk.length;
    if(total>maxBytes) throw Object.assign(new Error('file too large'),{statusCode:413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function sb(path,options={}){
  if(!SUPABASE_URL||!SUPABASE_KEY||!WORKSPACE_TOKEN) throw new Error('Data store is not configured');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    ...options,
    headers:{
      apikey:SUPABASE_KEY,
      authorization:`Bearer ${SUPABASE_KEY}`,
      'x-workspace-token':WORKSPACE_TOKEN,
      'content-type':'application/json',
      accept:'application/json',
      ...(options.headers||{})
    }
  });
  const text=await r.text();
  let data=null; try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok) throw new Error(typeof data==='string'?data:(data?.message||`Supabase ${r.status}`));
  return data;
}
function categoryFor(name,mime=''){
  const ext=extname(name||'').toLowerCase();
  if(ext==='.xlsx'||ext==='.xls'||ext==='.csv') return 'Data / Finance';
  if(ext==='.pptx'||ext==='.ppt') return 'Presentation';
  if(ext==='.jpg'||ext==='.jpeg'||ext==='.png'||ext==='.webp'||mime.startsWith('image/')) return 'Photo / Evidence';
  if(ext==='.pdf') return 'PDF / Report';
  if(ext==='.docx'||ext==='.doc'||ext==='.txt'||ext==='.rtf') return 'Document / Report';
  return 'Project Document';
}
function safeFileName(name){
  return String(name||'project-document').replace(/[\r\n\0]/g,' ').trim().slice(0,220)||'project-document';
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/health') return json(res,200,{ok:true,service:'fsl-concierge',version:'1.2.0',mode:'real-data'});
    if(!authorized(req)) return authRequired(res);

    if(req.method==='GET'&&url.pathname==='/api/state'){
      const [items,memory,sync,reports,documents]=await Promise.all([
        sb('fsl_concierge_items?select=*&order=received_at.desc.nullslast,created_at.desc'),
        sb('fsl_concierge_memory?select=*&order=updated_at.desc'),
        sb('fsl_concierge_sync_state?select=*&id=eq.hibo-gmail&limit=1'),
        sb('fsl_concierge_reports?select=*&order=updated_at.desc'),
        sb('fsl_concierge_documents?select=id,file_name,mime_type,size_bytes,source,category,description,uploaded_by,status,created_at,updated_at&status=eq.available&order=created_at.desc')
      ]);
      return json(res,200,{ok:true,items:items||[],memory:memory||[],sync:(sync||[])[0]||null,reports:reports||[],documents:documents||[]});
    }

    if(req.method==='POST'&&url.pathname==='/api/documents/upload'){
      const rawLength=Number(req.headers['content-length']||0);
      if(rawLength>MAX_FILE_BYTES) return json(res,413,{ok:false,error:'File exceeds the 15 MB limit.'});
      const fileName=safeFileName(decodeURIComponent(String(req.headers['x-file-name']||'project-document')));
      const mime=String(req.headers['content-type']||'application/octet-stream').slice(0,160);
      const description=decodeURIComponent(String(req.headers['x-file-description']||'')).slice(0,500);
      const buffer=await readBuffer(req);
      if(!buffer.length) return json(res,400,{ok:false,error:'The uploaded file is empty.'});
      const saved=await sb('fsl_concierge_documents',{
        method:'POST',headers:{Prefer:'return=representation'},
        body:JSON.stringify({file_name:fileName,mime_type:mime,size_bytes:buffer.length,content_base64:buffer.toString('base64'),source:'manual_upload',category:categoryFor(fileName,mime),description,uploaded_by:'Hibo',status:'available'})
      });
      const d=(saved||[])[0]||null;
      if(d) delete d.content_base64;
      return json(res,201,{ok:true,document:d});
    }

    const download=url.pathname.match(/^\/api\/documents\/([0-9a-f-]{36})\/download$/i);
    if(req.method==='GET'&&download){
      const rows=await sb(`fsl_concierge_documents?select=id,file_name,mime_type,content_base64,status&id=eq.${encodeURIComponent(download[1])}&limit=1`);
      const d=(rows||[])[0];
      if(!d||d.status!=='available') return json(res,404,{ok:false,error:'Document not found.'});
      const buf=Buffer.from(d.content_base64||'','base64');
      const name=safeFileName(d.file_name).replace(/"/g,'');
      res.writeHead(200,{
        'content-type':d.mime_type||'application/octet-stream',
        'content-length':buf.length,
        'content-disposition':`attachment; filename="${name}"`,
        'cache-control':'private, no-store',
        'x-content-type-options':'nosniff'
      });
      return res.end(buf);
    }

    const complete=url.pathname.match(/^\/api\/items\/([0-9a-f-]{36})\/complete$/i);
    if(req.method==='POST'&&complete){
      const body=await readBody(req);
      const note=String(body.note||'Reviewed and completed by Hibo').slice(0,500);
      const updated=await sb(`fsl_concierge_items?id=eq.${encodeURIComponent(complete[1])}`,{
        method:'PATCH',headers:{Prefer:'return=representation'},
        body:JSON.stringify({status:'completed',completed_at:new Date().toISOString(),completion_note:note,updated_at:new Date().toISOString()})
      });
      return json(res,200,{ok:true,item:(updated||[])[0]||null});
    }

    const reopen=url.pathname.match(/^\/api\/items\/([0-9a-f-]{36})\/reopen$/i);
    if(req.method==='POST'&&reopen){
      const updated=await sb(`fsl_concierge_items?id=eq.${encodeURIComponent(reopen[1])}`,{
        method:'PATCH',headers:{Prefer:'return=representation'},
        body:JSON.stringify({status:'active',completed_at:null,completion_note:null,updated_at:new Date().toISOString()})
      });
      return json(res,200,{ok:true,item:(updated||[])[0]||null});
    }

    if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'});
      return res.end(html);
    }
    return json(res,404,{ok:false,error:'Not found'});
  }catch(err){
    console.error(err);
    const code=err.statusCode||500;
    return json(res,code,{ok:false,error:code===413?'File exceeds the 15 MB limit.':'The concierge could not complete that request.'});
  }
});
server.listen(port,'0.0.0.0',()=>console.log(`Hibo FSL Concierge listening on ${port}`));
