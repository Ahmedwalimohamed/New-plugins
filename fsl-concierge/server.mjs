import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { timingSafeEqual, createHmac, randomBytes, scryptSync } from 'node:crypto';

const __dirname=dirname(fileURLToPath(import.meta.url));
const html=await readFile(join(__dirname,'index.html'));
const adminHtml=await readFile(join(__dirname,'admin.html'));
const port=Number(process.env.PORT||3000);
const SUPABASE_URL=process.env.SUPABASE_URL||'';
const SUPABASE_KEY=process.env.SUPABASE_KEY||'';
const WORKSPACE_TOKEN=process.env.WORKSPACE_TOKEN||'';
const APP_USERNAME=process.env.APP_USERNAME||'';
const APP_PASSWORD=process.env.APP_PASSWORD||'';
const SESSION_SECRET=`${APP_PASSWORD}:${WORKSPACE_TOKEN}:humanitarian-concierge-session`;
const SESSION_MAX_AGE=8*60*60;
const MAX_FILE_BYTES=15*1024*1024;

function secureEqual(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));return aa.length===bb.length&&timingSafeEqual(aa,bb)}
function sign(value){return createHmac('sha256',SESSION_SECRET).update(value).digest('hex')}
function b64(v){return Buffer.from(v).toString('base64url')}
function unb64(v){return Buffer.from(v,'base64url').toString('utf8')}
function parseCookies(req){const out={};for(const part of String(req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}return out}
function makeSession(payload){const body=b64(JSON.stringify({...payload,exp:Math.floor(Date.now()/1000)+SESSION_MAX_AGE}));return `${body}.${sign(body)}`}
function getSession(req){const token=parseCookies(req).concierge_session||'';const i=token.lastIndexOf('.');if(i<1)return null;const body=token.slice(0,i),sig=token.slice(i+1);if(!secureEqual(sig,sign(body)))return null;try{const p=JSON.parse(unb64(body));if(!p.exp||p.exp<Math.floor(Date.now()/1000))return null;return p}catch{return null}}
function sessionCookie(token,maxAge=SESSION_MAX_AGE){return `concierge_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))}
function redirect(res,location,cookie){const h={location,'cache-control':'no-store'};if(cookie)h['set-cookie']=cookie;res.writeHead(303,h);res.end()}
function htmlResponse(res,body){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','referrer-policy':'no-referrer','x-content-type-options':'nosniff'});res.end(body)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function clean(v,n=250){return String(v??'').trim().slice(0,n)}
function validEmail(v){return !v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())}
function validUsername(v){return /^[a-zA-Z0-9._-]{3,60}$/.test(String(v||''))}
function hashPassword(password,salt=randomBytes(16).toString('hex')){return {salt,hash:scryptSync(String(password),salt,64).toString('hex')}}
function verifyPassword(password,salt,expected){if(!salt||!expected)return false;try{return secureEqual(scryptSync(String(password),salt,64).toString('hex'),expected)}catch{return false}}

const authCss=`:root{--navy:#0d2c3b;--blue:#0f6c8e;--ink:#13232d;--muted:#687984;--line:#dbe5e9;--bg:#f3f7f9;--bad:#9d2d23;--good:#28704a}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 15% 10%,#e5f2f7,transparent 35%),var(--bg);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}.wrap{width:min(430px,100%)}.brand{margin-bottom:18px}.brand small{color:#557684;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:850}.brand h1{margin:4px 0 0;font-size:28px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:0 18px 55px rgba(13,44,59,.08)}label{display:block;font-weight:750;margin:14px 0 6px}input{width:100%;padding:12px 13px;border:1px solid #cbd8de;border-radius:10px;font:inherit;outline:none}input:focus{border-color:var(--blue);box-shadow:0 0 0 3px #0f6c8e18}.btn{width:100%;border:0;border-radius:10px;padding:12px 15px;margin-top:18px;background:var(--blue);color:#fff;font-weight:850;font:inherit;cursor:pointer}.note{font-size:12px;color:var(--muted);margin-top:14px}.error{background:#fdecea;color:var(--bad);padding:10px 12px;border-radius:9px;margin:12px 0}.success{background:#e9f6ee;color:var(--good);padding:10px 12px;border-radius:9px;margin:12px 0}.link{display:inline-block;margin-top:12px;color:var(--blue);font-weight:750;text-decoration:none}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}`;
function authShell(title,content){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Humanitarian Operations Concierge</title><style>${authCss}</style></head><body><div class="wrap"><div class="brand"><small>Humanitarian workflow automation</small><h1>Operations Concierge</h1></div>${content}</div></body></html>`}
function loginPage(error=''){return authShell('Login',`<form class="card" method="post" action="/login"><h2 style="margin:0 0 4px">Sign in</h2><div style="color:var(--muted)">Your workspace is private to your account and evidence sources.</div>${error?`<div class="error">${esc(error)}</div>`:''}<label>Username</label><input name="username" autocomplete="username" required autofocus><label>Password</label><input type="password" name="password" autocomplete="current-password" required><button class="btn">Log in</button><a class="link" href="/forgot-password">Forgot password?</a><div class="note">Password reset requests must be approved by an administrator.</div></form>`)}
function forgotPage(status=''){return authShell('Password help',`<form class="card" method="post" action="/forgot-password"><h2 style="margin:0 0 4px">Request password reset</h2><div style="color:var(--muted)">Enter your username. An administrator must approve the reset and issue a temporary password.</div>${status?`<div class="success">${esc(status)}</div>`:''}<label>Username</label><input name="username" autocomplete="username" required autofocus><button class="btn">Request reset</button><a class="link" href="/login">Back to login</a></form>`)}
function changePasswordPage(error=''){return authShell('Change password',`<form class="card" method="post" action="/change-password"><h2 style="margin:0 0 4px">Create your new password</h2><div style="color:var(--muted)">Your temporary password was accepted. Choose a private password before opening your workspace.</div>${error?`<div class="error">${esc(error)}</div>`:''}<label>New password</label><input type="password" name="password" minlength="8" autocomplete="new-password" required autofocus><label>Confirm new password</label><input type="password" name="confirm" minlength="8" autocomplete="new-password" required><button class="btn">Save new password</button><div class="note">Minimum 8 characters. The administrator cannot see this password.</div></form>`)}

async function readText(req,max=30000){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error('body too large')}return raw}
async function readBody(req){const raw=await readText(req);return raw?JSON.parse(raw):{}}
async function readBuffer(req,maxBytes=MAX_FILE_BYTES){const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>maxBytes)throw Object.assign(new Error('file too large'),{statusCode:413});chunks.push(chunk)}return Buffer.concat(chunks)}
async function sb(path,options={}){if(!SUPABASE_URL||!SUPABASE_KEY||!WORKSPACE_TOKEN)throw new Error('Data store is not configured');const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${SUPABASE_KEY}`,'x-workspace-token':WORKSPACE_TOKEN,'content-type':'application/json',accept:'application/json',...(options.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(typeof data==='string'?data:(data?.message||`Supabase ${r.status}`));return data}
function categoryFor(name,mime=''){const ext=extname(name||'').toLowerCase();if(ext==='.xlsx'||ext==='.xls'||ext==='.csv')return'Data / Finance';if(ext==='.pptx'||ext==='.ppt')return'Presentation';if(ext==='.jpg'||ext==='.jpeg'||ext==='.png'||ext==='.webp'||mime.startsWith('image/'))return'Photo / Evidence';if(ext==='.pdf')return'PDF / Report';if(ext==='.docx'||ext==='.doc'||ext==='.txt'||ext==='.rtf')return'Document / Report';return'Project Document'}
function safeFileName(name){return String(name||'project-document').replace(/[\r\n\0]/g,' ').trim().slice(0,220)||'project-document'}
function requireSession(req,res,url){const s=getSession(req);if(!s){if(url.pathname.startsWith('/api/'))json(res,401,{ok:false,error:'Authentication required'});else redirect(res,'/login');return null}return s}
function requireAdmin(req,res,url){const s=requireSession(req,res,url);if(!s)return null;if(s.role!=='admin'){if(url.pathname.startsWith('/api/'))json(res,403,{ok:false,error:'Administrator access required'});else redirect(res,'/');return null}return s}
function requireWorker(req,res,url){const s=requireSession(req,res,url);if(!s)return null;if(s.role==='admin'){if(url.pathname.startsWith('/api/'))json(res,403,{ok:false,error:'Worker workspace required'});else redirect(res,'/admin');return null}if(s.must_change){if(url.pathname.startsWith('/api/'))json(res,403,{ok:false,error:'Password change required'});else redirect(res,'/change-password');return null}return s}

const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health')return json(res,200,{ok:true,service:'humanitarian-operations-concierge',version:'2.1.0',mode:'multi-user'});

  if(req.method==='GET'&&url.pathname==='/login'){const s=getSession(req);if(s)return redirect(res,s.role==='admin'?'/admin':s.must_change?'/change-password':'/');return htmlResponse(res,loginPage(url.searchParams.get('error')?'Incorrect username, password, or account status.':''))}
  if(req.method==='POST'&&url.pathname==='/login'){
   const form=new URLSearchParams(await readText(req));const username=clean(form.get('username'),80).toLowerCase(),password=String(form.get('password')||'');
   if(APP_USERNAME&&APP_PASSWORD&&secureEqual(username,String(APP_USERNAME).toLowerCase())&&secureEqual(password,APP_PASSWORD))return redirect(res,'/admin',sessionCookie(makeSession({role:'admin',name:'Administrator'})));
   const rows=await sb(`humanitarian_users?select=id,username,full_name,role,status,password_salt,password_hash,must_change_password&username=eq.${encodeURIComponent(username)}&limit=1`);const u=(rows||[])[0];
   if(u&&u.status!=='disabled'&&verifyPassword(password,u.password_salt,u.password_hash)){
    await sb(`humanitarian_users?id=eq.${u.id}`,{method:'PATCH',body:JSON.stringify({last_login_at:new Date().toISOString(),status:'active',updated_at:new Date().toISOString()})});
    const token=makeSession({role:'worker',user_id:u.id,name:u.full_name,username:u.username,must_change:Boolean(u.must_change_password)});
    return redirect(res,u.must_change_password?'/change-password':'/',sessionCookie(token))
   }
   return redirect(res,'/login?error=1',sessionCookie('',0))
  }
  if(req.method==='POST'&&url.pathname==='/logout')return redirect(res,'/login',sessionCookie('',0));

  if(req.method==='GET'&&url.pathname==='/forgot-password')return htmlResponse(res,forgotPage(url.searchParams.get('requested')?'Your request was submitted. Contact your administrator for the temporary password.':''));
  if(req.method==='POST'&&url.pathname==='/forgot-password'){
   const form=new URLSearchParams(await readText(req));const username=clean(form.get('username'),60).toLowerCase();
   if(validUsername(username)){
    const now=new Date().toISOString();
    await sb(`humanitarian_users?username=eq.${encodeURIComponent(username)}&role=eq.worker&status=neq.disabled`,{method:'PATCH',body:JSON.stringify({password_reset_status:'pending',password_reset_requested_at:now,password_reset_approved_at:null,password_reset_resolved_at:null,updated_at:now})});
   }
   return redirect(res,'/forgot-password?requested=1')
  }

  if(req.method==='GET'&&url.pathname==='/change-password'){
   const s=getSession(req);if(!s)return redirect(res,'/login');if(s.role==='admin')return redirect(res,'/admin');if(!s.must_change)return redirect(res,'/');return htmlResponse(res,changePasswordPage(url.searchParams.get('error')?'Passwords must match and contain at least 8 characters.':''))
  }
  if(req.method==='POST'&&url.pathname==='/change-password'){
   const s=getSession(req);if(!s)return redirect(res,'/login');if(s.role==='admin')return redirect(res,'/admin');
   const form=new URLSearchParams(await readText(req)),password=String(form.get('password')||''),confirm=String(form.get('confirm')||'');
   if(password.length<8||password!==confirm)return redirect(res,'/change-password?error=1');
   const hp=hashPassword(password),now=new Date().toISOString();
   await sb(`humanitarian_users?id=eq.${s.user_id}&role=eq.worker`,{method:'PATCH',body:JSON.stringify({password_salt:hp.salt,password_hash:hp.hash,must_change_password:false,password_reset_status:'resolved',password_reset_resolved_at:now,updated_at:now})});
   return redirect(res,'/',sessionCookie(makeSession({role:'worker',user_id:s.user_id,name:s.name,username:s.username,must_change:false})))
  }

  if(req.method==='GET'&&url.pathname==='/admin'){if(!requireAdmin(req,res,url))return;return htmlResponse(res,adminHtml)}

  if(req.method==='GET'&&url.pathname==='/api/admin/users'){
   if(!requireAdmin(req,res,url))return;
   const [users,accounts,docs,items]=await Promise.all([
    sb('humanitarian_users?select=id,username,full_name,contact_email,organization,job_title,department,role,status,must_change_password,password_reset_status,password_reset_requested_at,password_reset_approved_at,password_reset_resolved_at,last_login_at,created_at&role=eq.worker&order=password_reset_requested_at.desc.nullslast,created_at.desc'),
    sb('humanitarian_email_accounts?select=user_id,status'),sb('fsl_concierge_documents?select=user_id,status'),sb('fsl_concierge_items?select=user_id,status,needs_user')]);
   const rows=(users||[]).map(u=>({...u,connected_emails:(accounts||[]).filter(a=>a.user_id===u.id&&a.status==='connected').length,documents:(docs||[]).filter(d=>d.user_id===u.id&&d.status==='available').length,open_items:(items||[]).filter(i=>i.user_id===u.id&&i.status!=='completed'&&i.needs_user).length}));
   return json(res,200,{ok:true,users:rows,totals:{users:rows.length,active:rows.filter(u=>u.status==='active').length,pendingResets:rows.filter(u=>u.password_reset_status==='pending').length,connectedEmails:(accounts||[]).filter(a=>a.status==='connected').length,documents:(docs||[]).filter(d=>d.status==='available').length}})
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/users'){
   if(!requireAdmin(req,res,url))return;const b=await readBody(req),username=clean(b.username,60).toLowerCase(),password=String(b.password||''),email=clean(b.contact_email,320).toLowerCase();
   if(!validUsername(username))return json(res,400,{ok:false,error:'Username must be 3–60 characters using letters, numbers, dot, dash or underscore.'});if(password.length<8)return json(res,400,{ok:false,error:'Temporary password must be at least 8 characters.'});if(!clean(b.full_name,180))return json(res,400,{ok:false,error:'Full name is required.'});if(email&&!validEmail(email))return json(res,400,{ok:false,error:'Enter a valid contact email.'});
   const hp=hashPassword(password);
   try{const saved=await sb('humanitarian_users',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({username,full_name:clean(b.full_name,180),contact_email:email||null,organization:clean(b.organization,200)||null,job_title:clean(b.job_title,160)||null,department:clean(b.department,160)||null,role:'worker',status:'active',password_salt:hp.salt,password_hash:hp.hash,must_change_password:true,password_reset_status:'none'})});return json(res,201,{ok:true,user:(saved||[])[0]||null})}catch(e){if(String(e.message).toLowerCase().includes('duplicate'))return json(res,409,{ok:false,error:'That username already exists.'});throw e}
  }
  const adminStatus=url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/status$/i);
  if(req.method==='POST'&&adminStatus){if(!requireAdmin(req,res,url))return;const b=await readBody(req);if(!['active','disabled'].includes(b.status))return json(res,400,{ok:false,error:'Invalid status'});const updated=await sb(`humanitarian_users?id=eq.${adminStatus[1]}&role=eq.worker`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:b.status,updated_at:new Date().toISOString()})});return json(res,200,{ok:true,user:(updated||[])[0]||null})}
  const adminPassword=url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/password$/i);
  if(req.method==='POST'&&adminPassword){if(!requireAdmin(req,res,url))return;const b=await readBody(req),password=String(b.password||'');if(password.length<8)return json(res,400,{ok:false,error:'Password must be at least 8 characters.'});const hp=hashPassword(password),now=new Date().toISOString();const updated=await sb(`humanitarian_users?id=eq.${adminPassword[1]}&role=eq.worker`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({password_salt:hp.salt,password_hash:hp.hash,must_change_password:true,status:'active',password_reset_status:'approved',password_reset_approved_at:now,password_reset_resolved_at:null,updated_at:now})});return json(res,200,{ok:true,user:(updated||[])[0]||null})}

  const session=requireWorker(req,res,url);if(!session)return;const uid=session.user_id;
  if(req.method==='GET'&&url.pathname==='/api/state'){
   const [profile,items,memory,sync,reports,documents,emailSources,emailAccounts]=await Promise.all([
    sb(`humanitarian_users?select=id,username,full_name,contact_email,organization,job_title,department,status,must_change_password&id=eq.${uid}&limit=1`),sb(`fsl_concierge_items?select=*&user_id=eq.${uid}&order=received_at.desc.nullslast,created_at.desc`),sb(`fsl_concierge_memory?select=*&user_id=eq.${uid}&order=updated_at.desc`),sb(`fsl_concierge_sync_state?select=*&user_id=eq.${uid}&order=last_sync_at.desc.nullslast&limit=1`),sb(`fsl_concierge_reports?select=*&user_id=eq.${uid}&order=updated_at.desc`),sb(`fsl_concierge_documents?select=id,file_name,mime_type,size_bytes,source,category,description,uploaded_by,status,created_at,updated_at&user_id=eq.${uid}&status=eq.available&order=created_at.desc`),sb(`fsl_concierge_email_sources?select=*&user_id=eq.${uid}&order=is_active.desc,created_at.desc`),sb(`humanitarian_email_accounts?select=id,provider,account_email,label,status,is_primary,last_sync_at,created_at&user_id=eq.${uid}&order=is_primary.desc,created_at.asc`)]);
   return json(res,200,{ok:true,profile:(profile||[])[0]||null,items:items||[],memory:memory||[],sync:(sync||[])[0]||null,reports:reports||[],documents:documents||[],emailSources:emailSources||[],emailAccounts:emailAccounts||[],emailOAuth:{gmailConfigured:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),outlookConfigured:Boolean(process.env.MICROSOFT_CLIENT_ID&&process.env.MICROSOFT_CLIENT_SECRET)}})
  }
  if(req.method==='POST'&&url.pathname==='/api/email-accounts'){
   const b=await readBody(req),account_email=clean(b.account_email,320).toLowerCase(),provider=clean(b.provider,40).toLowerCase()||'gmail';if(!validEmail(account_email))return json(res,400,{ok:false,error:'Enter a valid email address.'});if(!['gmail','outlook','other'].includes(provider))return json(res,400,{ok:false,error:'Unsupported email provider.'});
   try{const saved=await sb('humanitarian_email_accounts',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:uid,provider,account_email,label:clean(b.label,100)||null,status:'pending',is_primary:false})});return json(res,201,{ok:true,account:(saved||[])[0]||null,requires_oauth:provider!=='other'})}catch(e){if(String(e.message).toLowerCase().includes('duplicate'))return json(res,409,{ok:false,error:'That email account is already attached to your workspace.'});throw e}
  }
  const emailDisconnect=url.pathname.match(/^\/api\/email-accounts\/([0-9a-f-]{36})\/disconnect$/i);
  if(req.method==='POST'&&emailDisconnect){const updated=await sb(`humanitarian_email_accounts?id=eq.${emailDisconnect[1]}&user_id=eq.${uid}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'disconnected',connection_ref:null,is_primary:false,updated_at:new Date().toISOString()})});return json(res,200,{ok:true,account:(updated||[])[0]||null})}
  if(req.method==='POST'&&url.pathname==='/api/email-sources'){
   const b=await readBody(req),email=clean(b.email,320).toLowerCase();if(!validEmail(email))return json(res,400,{ok:false,error:'Enter a valid email address.'});
   try{const saved=await sb('fsl_concierge_email_sources',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:uid,email,display_name:clean(b.display_name,160)||null,organization:clean(b.organization,180)||null,source_role:clean(b.source_role,120)||null,notes:clean(b.notes,500)||null,is_active:true})});return json(res,201,{ok:true,source:(saved||[])[0]||null})}catch(e){if(String(e.message).toLowerCase().includes('duplicate'))return json(res,409,{ok:false,error:'That email is already in your evidence source list.'});throw e}
  }
  const sourceToggle=url.pathname.match(/^\/api\/email-sources\/([0-9a-f-]{36})\/toggle$/i);
  if(req.method==='POST'&&sourceToggle){const b=await readBody(req);const updated=await sb(`fsl_concierge_email_sources?id=eq.${sourceToggle[1]}&user_id=eq.${uid}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({is_active:Boolean(b.is_active),updated_at:new Date().toISOString()})});return json(res,200,{ok:true,source:(updated||[])[0]||null})}
  const sourceDelete=url.pathname.match(/^\/api\/email-sources\/([0-9a-f-]{36})$/i);
  if(req.method==='DELETE'&&sourceDelete){await sb(`fsl_concierge_email_sources?id=eq.${sourceDelete[1]}&user_id=eq.${uid}`,{method:'DELETE'});return json(res,200,{ok:true})}
  if(req.method==='POST'&&url.pathname==='/api/documents/upload'){
   const rawLength=Number(req.headers['content-length']||0);if(rawLength>MAX_FILE_BYTES)return json(res,413,{ok:false,error:'File exceeds the 15 MB limit.'});const fileName=safeFileName(decodeURIComponent(String(req.headers['x-file-name']||'project-document'))),mime=String(req.headers['content-type']||'application/octet-stream').slice(0,160),description=decodeURIComponent(String(req.headers['x-file-description']||'')).slice(0,500),buffer=await readBuffer(req);if(!buffer.length)return json(res,400,{ok:false,error:'The uploaded file is empty.'});
   const saved=await sb('fsl_concierge_documents',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:uid,file_name:fileName,mime_type:mime,size_bytes:buffer.length,content_base64:buffer.toString('base64'),source:'manual_upload',category:categoryFor(fileName,mime),description,uploaded_by:session.name||session.username,status:'available'})});const d=(saved||[])[0]||null;if(d)delete d.content_base64;return json(res,201,{ok:true,document:d})
  }
  const download=url.pathname.match(/^\/api\/documents\/([0-9a-f-]{36})\/download$/i);
  if(req.method==='GET'&&download){const rows=await sb(`fsl_concierge_documents?select=id,file_name,mime_type,content_base64,status&id=eq.${download[1]}&user_id=eq.${uid}&limit=1`),d=(rows||[])[0];if(!d||d.status!=='available')return json(res,404,{ok:false,error:'Document not found.'});const buf=Buffer.from(d.content_base64||'','base64'),name=safeFileName(d.file_name).replace(/"/g,'');res.writeHead(200,{'content-type':d.mime_type||'application/octet-stream','content-length':buf.length,'content-disposition':`attachment; filename="${name}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'});return res.end(buf)}
  const complete=url.pathname.match(/^\/api\/items\/([0-9a-f-]{36})\/complete$/i);
  if(req.method==='POST'&&complete){const b=await readBody(req),note=clean(b.note,500)||'Reviewed and completed';const updated=await sb(`fsl_concierge_items?id=eq.${complete[1]}&user_id=eq.${uid}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'completed',completed_at:new Date().toISOString(),completion_note:note,updated_at:new Date().toISOString()})});return json(res,200,{ok:true,item:(updated||[])[0]||null})}
  const reopen=url.pathname.match(/^\/api\/items\/([0-9a-f-]{36})\/reopen$/i);
  if(req.method==='POST'&&reopen){const updated=await sb(`fsl_concierge_items?id=eq.${reopen[1]}&user_id=eq.${uid}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'active',completed_at:null,completion_note:null,updated_at:new Date().toISOString()})});return json(res,200,{ok:true,item:(updated||[])[0]||null})}
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html'))return htmlResponse(res,html);
  return json(res,404,{ok:false,error:'Not found'})
 }catch(err){console.error(err);const code=err.statusCode||500;return json(res,code,{ok:false,error:code===413?'File exceeds the 15 MB limit.':'The concierge could not complete that request.'})}
});
server.listen(port,'0.0.0.0',()=>console.log(`Humanitarian Operations Concierge listening on ${port}`));
