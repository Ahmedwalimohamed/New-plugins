import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { timingSafeEqual, createHmac } from 'node:crypto';

const __dirname=dirname(fileURLToPath(import.meta.url));
const html=await readFile(join(__dirname,'index.html'));
const port=Number(process.env.PORT||3000);
const SUPABASE_URL=process.env.SUPABASE_URL||'';
const SUPABASE_KEY=process.env.SUPABASE_KEY||'';
const WORKSPACE_TOKEN=process.env.WORKSPACE_TOKEN||'';
const APP_USERNAME=process.env.APP_USERNAME||'';
const APP_PASSWORD=process.env.APP_PASSWORD||'';
const SESSION_SECRET=`${APP_PASSWORD}:${WORKSPACE_TOKEN}:hibo-fsl-session`;
const SESSION_MAX_AGE=8*60*60;
const MAX_FILE_BYTES=15*1024*1024;

function secureEqual(a,b){
  const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b));
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}
function sign(value){return createHmac('sha256',SESSION_SECRET).update(value).digest('hex')}
function parseCookies(req){
  const out={};
  for(const part of String(req.headers.cookie||'').split(';')){
    const i=part.indexOf('=');
    if(i>0) out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function makeSession(){
  const exp=String(Math.floor(Date.now()/1000)+SESSION_MAX_AGE);
  return `${exp}.${sign(exp)}`;
}
function authorized(req){
  if(!APP_USERNAME||!APP_PASSWORD||!WORKSPACE_TOKEN) return false;
  const token=parseCookies(req).hibo_session||'';
  const [exp,sig]=token.split('.');
  if(!exp||!sig||!/^\d+$/.test(exp)||Number(exp)<Math.floor(Date.now()/1000)) return false;
  return secureEqual(sig,sign(exp));
}
function sessionCookie(token,maxAge=SESSION_MAX_AGE){
  return `hibo_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function json(res,status,data){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(data));
}
function redirect(res,location,cookie){
  const headers={location,'cache-control':'no-store'};
  if(cookie) headers['set-cookie']=cookie;
  res.writeHead(303,headers);res.end();
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function loginPage(error=''){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Login · Hibo's FSL Concierge</title><style>
  :root{--navy:#0d2c3b;--blue:#0f6c8e;--ink:#13232d;--muted:#687984;--line:#dbe5e9;--bg:#f3f7f9;--bad:#9d2d23}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 15% 10%,#e5f2f7,transparent 35%),var(--bg);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}.wrap{width:min(430px,100%)}.brand{margin-bottom:18px}.brand small{color:#557684;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:850}.brand h1{margin:4px 0 0;font-size:28px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:0 18px 55px rgba(13,44,59,.08)}label{display:block;font-weight:750;margin:14px 0 6px}input{width:100%;padding:12px 13px;border:1px solid #cbd8de;border-radius:10px;font:inherit;outline:none}input:focus{border-color:var(--blue);box-shadow:0 0 0 3px #0f6c8e18}.btn{width:100%;border:0;border-radius:10px;padding:12px 15px;margin-top:18px;background:var(--blue);color:#fff;font-weight:850;font:inherit;cursor:pointer}.note{font-size:12px;color:var(--muted);margin-top:14px}.error{background:#fdecea;color:var(--bad);padding:10px 12px;border-radius:9px;margin-bottom:12px}</style></head><body><div class="wrap"><div class="brand"><small>FSL Workflow Automation</small><h1>Hibo's Concierge</h1></div><form class="card" method="post" action="/login"><h2 style="margin:0 0 4px">Sign in</h2><div style="color:var(--muted)">Access Hibo's protected project workspace.</div>${error?`<div class="error">${esc(error)}</div>`:''}<label for="username">Username</label><input id="username" name="username" autocomplete="username" required autofocus><label for="password">Password</label><input id="password" type="password" name="password" autocomplete="current-password" required><button class="btn" type="submit">Log in</button><div class="note">Your session automatically expires after 8 hours.</div></form></div></body></html>`;
}
async function readText(req,max=20000){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max) throw new Error('body too large')}return raw;
}
async function readBody(req){const raw=await readText(req);return raw?JSON.parse(raw):{}}
async function readBuffer(req,maxBytes=MAX_FILE_BYTES){
  const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>maxBytes) throw Object.assign(new Error('file too large'),{statusCode:413});chunks.push(chunk)}return Buffer.concat(chunks);
}
async function sb(path,options={}){
  if(!SUPABASE_URL||!SUPABASE_KEY||!WORKSPACE_TOKEN) throw new Error('Data store is not configured');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${SUPABASE_KEY}`,'x-workspace-token':WORKSPACE_TOKEN,'content-type':'application/json',accept:'application/json',...(options.headers||{})}});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok) throw new Error(typeof data==='string'?data:(data?.message||`Supabase ${r.status}`));return data;
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
function safeFileName(name){return String(name||'project-document').replace(/[\r\n\0]/g,' ').trim().slice(0,220)||'project-document'}
function clean(v,n=250){return String(v??'').trim().slice(0,n)}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim())}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/health') return json(res,200,{ok:true,service:'fsl-concierge',version:'1.3.0',mode:'real-data'});

    if(req.method==='GET'&&url.pathname==='/login'){
      if(authorized(req)) return redirect(res,'/');
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','referrer-policy':'no-referrer'});
      return res.end(loginPage(url.searchParams.get('error')?'Incorrect username or password.':''));
    }
    if(req.method==='POST'&&url.pathname==='/login'){
      const raw=await readText(req);const form=new URLSearchParams(raw);
      const u=form.get('username')||'',p=form.get('password')||'';
      if(secureEqual(u,APP_USERNAME)&&secureEqual(p,APP_PASSWORD)) return redirect(res,'/',sessionCookie(makeSession()));
      return redirect(res,'/login?error=1',sessionCookie('',0));
    }
    if(req.method==='POST'&&url.pathname==='/logout') return redirect(res,'/login',sessionCookie('',0));

    if(!authorized(req)){
      if(url.pathname.startsWith('/api/')) return json(res,401,{ok:false,error:'Authentication required'});
      return redirect(res,'/login');
    }

    if(req.method==='GET'&&url.pathname==='/api/state'){
      const [items,memory,sync,reports,documents,emailSources]=await Promise.all([
        sb('fsl_concierge_items?select=*&order=received_at.desc.nullslast,created_at.desc'),
        sb('fsl_concierge_memory?select=*&order=updated_at.desc'),
        sb('fsl_concierge_sync_state?select=*&id=eq.hibo-gmail&limit=1'),
        sb('fsl_concierge_reports?select=*&order=updated_at.desc'),
        sb('fsl_concierge_documents?select=id,file_name,mime_type,size_bytes,source,category,description,uploaded_by,status,created_at,updated_at&status=eq.available&order=created_at.desc'),
        sb('fsl_concierge_email_sources?select=*&order=is_active.desc,created_at.desc')
      ]);
      return json(res,200,{ok:true,items:items||[],memory:memory||[],sync:(sync||[])[0]||null,reports:reports||[],documents:documents||[],emailSources:emailSources||[]});
    }

    if(req.method==='POST'&&url.pathname==='/api/email-sources'){
      const body=await readBody(req);const email=clean(body.email,320).toLowerCase();
      if(!validEmail(email)) return json(res,400,{ok:false,error:'Enter a valid email address.'});
      try{
        const saved=await sb('fsl_concierge_email_sources',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({email,display_name:clean(body.display_name,160)||null,organization:clean(body.organization,180)||null,source_role:clean(body.source_role,120)||null,notes:clean(body.notes,500)||null,is_active:true})});
        return json(res,201,{ok:true,source:(saved||[])[0]||null});
      }catch(err){
        if(String(err.message).toLowerCase().includes('duplicate')) return json(res,409,{ok:false,error:'That email is already in the evidence source list.'});
        throw err;
      }
    }
    const sourceToggle=url.pathname.match(/^\/api\/email-sources\/([0-9a-f-]{36})\/toggle$/i);
    if(req.method==='POST'&&sourceToggle){
      const body=await readBody(req);const active=Boolean(body.is_active);
      const updated=await sb(`fsl_concierge_email_sources?id=eq.${encodeURIComponent(sourceToggle[1])}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({is_active:active,updated_at:new Date().toISOString()})});
      return json(res,200,{ok:true,source:(updated||[])[0]||null});
    }
    const sourceDelete=url.pathname.match(/^\/api\/email-sources\/([0-9a-f-]{36})$/i);
    if(req.method==='DELETE'&&sourceDelete){
      await sb(`fsl_concierge_email_sources?id=eq.${encodeURIComponent(sourceDelete[1])}`,{method:'DELETE'});
      return json(res,200,{ok:true});
    }

    if(req.method==='POST'&&url.pathname==='/api/documents/upload'){
      const rawLength=Number(req.headers['content-length']||0);if(rawLength>MAX_FILE_BYTES) return json(res,413,{ok:false,error:'File exceeds the 15 MB limit.'});
      const fileName=safeFileName(decodeURIComponent(String(req.headers['x-file-name']||'project-document')));const mime=String(req.headers['content-type']||'application/octet-stream').slice(0,160);const description=decodeURIComponent(String(req.headers['x-file-description']||'')).slice(0,500);const buffer=await readBuffer(req);
      if(!buffer.length) return json(res,400,{ok:false,error:'The uploaded file is empty.'});
      const saved=await sb('fsl_concierge_documents',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({file_name:fileName,mime_type:mime,size_bytes:buffer.length,content_base64:buffer.toString('base64'),source:'manual_upload',category:categoryFor(fileName,mime),description,uploaded_by:'Hibo',status:'available'})});
      const d=(saved||[])[0]||null;if(d) delete d.content_base64;return json(res,201,{ok:true,document:d});
    }
    const download=url.pathname.match(/^\/api\/documents\/([0-9a-f-]{36})\/download$/i);
    if(req.method==='GET'&&download){
      const rows=await sb(`fsl_concierge_documents?select=id,file_name,mime_type,content_base64,status&id=eq.${encodeURIComponent(download[1])}&limit=1`);const d=(rows||[])[0];if(!d||d.status!=='available') return json(res,404,{ok:false,error:'Document not found.'});
      const buf=Buffer.from(d.content_base64||'','base64');const name=safeFileName(d.file_name).replace(/"/g,'');res.writeHead(200,{'content-type':d.mime_type||'application/octet-stream','content-length':buf.length,'content-disposition':`attachment; filename="${name}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'});return res.end(buf);
    }
    const complete=url.pathname.match(/^\/api\/items\/([0-9a-f-]{36})\/complete$/i);
    if(req.method==='POST'&&complete){const body=await readBody(req);const note=String(body.note||'Reviewed and completed by Hibo').slice(0,500);const updated=await sb(`fsl_concierge_items?id=eq.${encodeURIComponent(complete[1])}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'completed',completed_at:new Date().toISOString(),completion_note:note,updated_at:new Date().toISOString()})});return json(res,200,{ok:true,item:(updated||[])[0]||null})}
    const reopen=url.pathname.match(/^\/api\/items\/([0-9a-f-]{36})\/reopen$/i);
    if(req.method==='POST'&&reopen){const updated=await sb(`fsl_concierge_items?id=eq.${encodeURIComponent(reopen[1])}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'active',completed_at:null,completion_note:null,updated_at:new Date().toISOString()})});return json(res,200,{ok:true,item:(updated||[])[0]||null})}
    if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'});return res.end(html)}
    return json(res,404,{ok:false,error:'Not found'});
  }catch(err){console.error(err);const code=err.statusCode||500;return json(res,code,{ok:false,error:code===413?'File exceeds the 15 MB limit.':'The concierge could not complete that request.'})}
});
server.listen(port,'0.0.0.0',()=>console.log(`Hibo FSL Concierge listening on ${port}`));
