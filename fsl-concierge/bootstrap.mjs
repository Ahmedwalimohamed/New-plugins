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

// Authentication guard: a username that belongs to a worker account must always
// be evaluated as that worker first. Global APP_USERNAME / APP_PASSWORD may only
// create an admin session when no worker account exists with the submitted username.
// This prevents credentials such as Hibo's from being routed to /admin when an
// administrator credential happens to overlap.
const serverPath = join(here, 'server.mjs');
let serverSource = await readFile(serverPath, 'utf8');
const loginPattern = /if\(req\.method==='POST'&&url\.pathname==='\/login'\)\{[\s\S]*?return redirect\(res,'\/login\?error=1',sessionCookie\('',0\)\)\n  \}/;
const fixedLogin = `if(req.method==='POST'&&url.pathname==='/login'){
   const form=new URLSearchParams(await readText(req));const username=clean(form.get('username'),80),password=String(form.get('password')||'');
   const rows=await sb(\`humanitarian_users?select=id,username,full_name,role,status,password_salt,password_hash,must_change_password&username=eq.\${encodeURIComponent(username)}&limit=1\`);const u=(rows||[])[0];
   if(u){
    if(u.status!=='disabled'&&verifyPassword(password,u.password_salt,u.password_hash)){
     await sb(\`humanitarian_users?id=eq.\${u.id}\`,{method:'PATCH',body:JSON.stringify({last_login_at:new Date().toISOString(),status:'active',updated_at:new Date().toISOString()})});
     return redirect(res,'/',sessionCookie(makeSession({role:'worker',user_id:u.id,name:u.full_name,username:u.username})))
    }
    return redirect(res,'/login?error=1',sessionCookie('',0))
   }
   if(APP_USERNAME&&APP_PASSWORD&&secureEqual(username,APP_USERNAME)&&secureEqual(password,APP_PASSWORD))return redirect(res,'/admin',sessionCookie(makeSession({role:'admin',name:'Administrator'})));
   return redirect(res,'/login?error=1',sessionCookie('',0))
  }`;
if(!loginPattern.test(serverSource)) throw new Error('Could not apply worker-first login guard');
serverSource = serverSource.replace(loginPattern, fixedLogin);
const runtimeServerPath = join(here, 'server-runtime.mjs');
await writeFile(runtimeServerPath, serverSource);
await import('./server-runtime.mjs');
