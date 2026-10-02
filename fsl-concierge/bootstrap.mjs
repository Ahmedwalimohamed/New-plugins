import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Assemble the worker-facing UI from small source-controlled chunks.
const parts = await Promise.all(
  Array.from({ length: 6 }, (_, i) =>
    readFile(join(here, 'ui', `part-${String(i).padStart(2, '0')}.html`))
  )
);
await writeFile(join(here, 'index.html'), Buffer.concat(parts));

const serverPath = join(here, 'server.mjs');
let serverSource = await readFile(serverPath, 'utf8');

// Recovery configuration stays server-side. The publishable key is safe for browser use;
// the recovery bridge secret is never rendered into HTML.
serverSource = serverSource.replace(
  "const APP_PASSWORD=process.env.APP_PASSWORD||'';",
  "const APP_PASSWORD=process.env.APP_PASSWORD||'';\nconst SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';\nconst RESET_BRIDGE_SECRET=process.env.RESET_BRIDGE_SECRET||'';"
);

// Authentication guard:
// 1) Every role uses the same /login page.
// 2) Workers may sign in with either their username or registered work email.
// 3) A matching worker identity is always evaluated before the global admin account.
const loginPattern = /if\(req\.method==='POST'&&url\.pathname==='\/login'\)\{[\s\S]*?return redirect\(res,'\/login\?error=1',sessionCookie\('',0\)\)\n  \}/;
const fixedLogin = `if(req.method==='POST'&&url.pathname==='/login'){
   const form=new URLSearchParams(await readText(req));const identifier=clean(form.get('username'),320).toLowerCase(),password=String(form.get('password')||'');
   let rows=await sb(\`humanitarian_users?select=id,username,contact_email,full_name,role,status,password_salt,password_hash,must_change_password&username=eq.\${encodeURIComponent(identifier)}&limit=1\`);
   if(!(rows||[]).length&&validEmail(identifier)) rows=await sb(\`humanitarian_users?select=id,username,contact_email,full_name,role,status,password_salt,password_hash,must_change_password&contact_email=eq.\${encodeURIComponent(identifier)}&limit=1\`);
   const u=(rows||[])[0];
   if(u){
    if(u.status!=='disabled'&&verifyPassword(password,u.password_salt,u.password_hash)){
     await sb(\`humanitarian_users?id=eq.\${u.id}\`,{method:'PATCH',body:JSON.stringify({last_login_at:new Date().toISOString(),status:'active',updated_at:new Date().toISOString()})});
     return redirect(res,'/',sessionCookie(makeSession({role:'worker',user_id:u.id,name:u.full_name,username:u.username})))
    }
    return redirect(res,'/login?error=1',sessionCookie('',0))
   }
   if(APP_USERNAME&&APP_PASSWORD&&secureEqual(identifier,String(APP_USERNAME).toLowerCase())&&secureEqual(password,APP_PASSWORD))return redirect(res,'/admin',sessionCookie(makeSession({role:'admin',name:'Administrator'})));
   return redirect(res,'/login?error=1',sessionCookie('',0))
  }`;
if(!loginPattern.test(serverSource)) throw new Error('Could not apply unified login guard');
serverSource = serverSource.replace(loginPattern, fixedLogin);

serverSource = serverSource.replace(
  '<label>Username</label><input name="username" autocomplete="username" required autofocus>',
  '<label>Username or email</label><input name="username" autocomplete="username" inputmode="email" placeholder="Username or work email" required autofocus>'
);
serverSource = serverSource.replace(
  '<button class="btn">Log in</button><div class="note">',
  '<button class="btn">Log in</button><div style="text-align:center;margin-top:14px"><a href="/forgot-password" style="color:var(--blue);font-weight:800;text-decoration:none">Forgot password?</a></div><div class="note">'
);

const recoveryPages = String.raw`
function forgotPasswordPage(sent=false,error=''){
 return \`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Forgot password · Operations Concierge</title><style>:root{--navy:#0d2c3b;--blue:#0f6c8e;--ink:#13232d;--muted:#687984;--line:#dbe5e9;--bg:#f3f7f9;--bad:#9d2d23;--good:#176b45}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 15% 10%,#e5f2f7,transparent 35%),var(--bg);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}.wrap{width:min(430px,100%)}.brand{margin-bottom:18px}.brand small{color:#557684;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:850}.brand h1{margin:4px 0 0;font-size:28px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:0 18px 55px rgba(13,44,59,.08)}label{display:block;font-weight:750;margin:14px 0 6px}input{width:100%;padding:12px 13px;border:1px solid #cbd8de;border-radius:10px;font:inherit;outline:none}input:focus{border-color:var(--blue);box-shadow:0 0 0 3px #0f6c8e18}.btn{width:100%;border:0;border-radius:10px;padding:12px 15px;margin-top:18px;background:var(--blue);color:#fff;font-weight:850;font:inherit;cursor:pointer}.note{font-size:12px;color:var(--muted);margin-top:14px}.msg{padding:11px 12px;border-radius:9px;margin:14px 0}.good{background:#eaf7f0;color:var(--good)}.bad{background:#fdecea;color:var(--bad)}a{color:var(--blue);font-weight:800;text-decoration:none}</style></head><body><div class="wrap"><div class="brand"><small>Humanitarian workflow automation</small><h1>Operations Concierge</h1></div><div class="card"><h2 style="margin:0 0 4px">Forgot password</h2><div style="color:var(--muted)">Enter the email saved on your account. We will send a secure password-reset link.</div>\${sent?'<div class="msg good">If that email belongs to an active account, a reset link has been sent. Check the inbox and spam folder.</div>':''}\${error?\`<div class="msg bad">\${esc(error)}</div>\`:''}<form method="post" action="/forgot-password"><label>Work email</label><input type="email" name="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required autofocus><button class="btn">Send reset link</button></form><div class="note"><a href="/login">Back to sign in</a></div></div></div></body></html>\`
}
function resetPasswordPage(){
 const supabaseUrl=JSON.stringify(SUPABASE_URL),publishableKey=JSON.stringify(SUPABASE_PUBLISHABLE_KEY);
 return \`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Reset password · Operations Concierge</title><style>:root{--blue:#0f6c8e;--ink:#13232d;--muted:#687984;--line:#dbe5e9;--bg:#f3f7f9;--bad:#9d2d23;--good:#176b45}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 15% 10%,#e5f2f7,transparent 35%),var(--bg);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}.wrap{width:min(430px,100%)}.brand{margin-bottom:18px}.brand small{color:#557684;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:850}.brand h1{margin:4px 0 0;font-size:28px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:0 18px 55px rgba(13,44,59,.08)}label{display:block;font-weight:750;margin:14px 0 6px}input{width:100%;padding:12px 13px;border:1px solid #cbd8de;border-radius:10px;font:inherit;outline:none}.btn{width:100%;border:0;border-radius:10px;padding:12px 15px;margin-top:18px;background:var(--blue);color:#fff;font-weight:850;font:inherit;cursor:pointer}.msg{padding:11px 12px;border-radius:9px;margin:14px 0}.bad{background:#fdecea;color:var(--bad)}.good{background:#eaf7f0;color:var(--good)}a{color:var(--blue);font-weight:800;text-decoration:none}</style></head><body><div class="wrap"><div class="brand"><small>Humanitarian workflow automation</small><h1>Operations Concierge</h1></div><div class="card"><h2 style="margin:0 0 4px">Choose a new password</h2><div style="color:var(--muted)">Use at least 8 characters.</div><div id="message"></div><form id="resetForm"><label>New password</label><input id="password" type="password" autocomplete="new-password" minlength="8" required><label>Confirm new password</label><input id="confirm" type="password" autocomplete="new-password" minlength="8" required><button class="btn">Save new password</button></form><div style="margin-top:14px"><a href="/login">Back to sign in</a></div></div></div><script>const SUPABASE_URL=\${supabaseUrl},PUBLISHABLE_KEY=\${publishableKey};const params=new URLSearchParams(location.hash.slice(1));const token=params.get('access_token')||'';const msg=document.getElementById('message'),form=document.getElementById('resetForm');function show(text,ok=false){msg.innerHTML='<div class="msg '+(ok?'good':'bad')+'">'+text.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</div>'}if(!token){form.style.display='none';show('This reset link is missing, expired, or already used. Request a new reset link.')}form.addEventListener('submit',async e=>{e.preventDefault();const p=document.getElementById('password').value,c=document.getElementById('confirm').value;if(p.length<8)return show('Password must be at least 8 characters.');if(p!==c)return show('Passwords do not match.');const btn=form.querySelector('button');btn.disabled=true;btn.textContent='Saving…';try{const r=await fetch(SUPABASE_URL+'/auth/v1/user',{method:'PUT',headers:{apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({password:p})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.msg||data.message||data.error_description||'The reset link is no longer valid.');const sync=await fetch('/api/password-recovery/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({access_token:token,password:p})});const s=await sync.json().catch(()=>({}));if(!sync.ok)throw new Error(s.error||'Password could not be saved to your workspace.');form.style.display='none';history.replaceState(null,'',location.pathname);show('Password updated. You can now sign in with your new password.',true)}catch(err){show(err.message||'Password could not be updated.');btn.disabled=false;btn.textContent='Save new password'}});</script></body></html>\`
}
`;

if (!serverSource.includes('function forgotPasswordPage(')) {
  serverSource = serverSource.replace('async function readText(req,max=30000)', recoveryPages + '\nasync function readText(req,max=30000)');
}

const publicRecoveryRoutes = String.raw`
  if(req.method==='GET'&&url.pathname==='/forgot-password'){
   const s=getSession(req);if(s)return redirect(res,s.role==='admin'?'/admin':'/');
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','referrer-policy':'no-referrer'});return res.end(forgotPasswordPage(url.searchParams.get('sent')==='1',url.searchParams.get('error')?'Password recovery is temporarily unavailable.':''))
  }
  if(req.method==='POST'&&url.pathname==='/forgot-password'){
   const form=new URLSearchParams(await readText(req));const email=clean(form.get('email'),320).toLowerCase();
   if(!validEmail(email)||!email)return redirect(res,'/forgot-password?sent=1');
   try{
    if(!RESET_BRIDGE_SECRET)throw new Error('Recovery bridge is not configured');
    const r=await fetch(\`\${SUPABASE_URL}/functions/v1/concierge-password-recovery\`,{method:'POST',headers:{'content-type':'application/json','x-reset-bridge-secret':RESET_BRIDGE_SECRET},body:JSON.stringify({email})});
    if(!r.ok)throw new Error('Recovery request failed');
    return redirect(res,'/forgot-password?sent=1')
   }catch(err){console.error('forgot password',err);return redirect(res,'/forgot-password?error=1')}
  }
  if(req.method==='GET'&&url.pathname==='/reset-password'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','referrer-policy':'no-referrer'});return res.end(resetPasswordPage())
  }
`;

if (!serverSource.includes("url.pathname==='/forgot-password'")) {
  serverSource = serverSource.replace("  if(req.method==='POST'&&url.pathname==='/logout')", publicRecoveryRoutes + "\n  if(req.method==='POST'&&url.pathname==='/logout')");
}

const recoverySyncRoute = String.raw`
  if(req.method==='POST'&&url.pathname==='/api/password-recovery/sync'){
   const b=await readBody(req),accessToken=String(b.access_token||''),password=String(b.password||'');
   if(!accessToken||password.length<8)return json(res,400,{ok:false,error:'Invalid password reset request.'});
   try{
    const vr=await fetch(\`\${SUPABASE_URL}/auth/v1/user\`,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:\`Bearer \${accessToken}\`}});
    const authUser=await vr.json().catch(()=>null);
    const email=clean(authUser?.email,320).toLowerCase();
    if(!vr.ok||!email)return json(res,401,{ok:false,error:'The reset link is invalid or expired.'});
    const rows=await sb(\`humanitarian_users?select=id,status,contact_email&contact_email=eq.\${encodeURIComponent(email)}&limit=1\`),u=(rows||[])[0];
    if(!u||u.status==='disabled')return json(res,403,{ok:false,error:'Account is not active.'});
    const hp=hashPassword(password);
    await sb(\`humanitarian_users?id=eq.\${u.id}\`,{method:'PATCH',body:JSON.stringify({password_salt:hp.salt,password_hash:hp.hash,must_change_password:false,status:'active',updated_at:new Date().toISOString()})});
    return json(res,200,{ok:true})
   }catch(err){console.error('password recovery sync',err);return json(res,500,{ok:false,error:'Password could not be updated.'})}
  }

`;
if (!serverSource.includes("url.pathname==='/api/password-recovery/sync'")) {
  serverSource = serverSource.replace('  const session=requireWorker(req,res,url);', recoverySyncRoute + '  const session=requireWorker(req,res,url);');
}

const runtimeServerPath = join(here, 'server-runtime.mjs');
await writeFile(runtimeServerPath, serverSource);
await import('./server-runtime.mjs');
