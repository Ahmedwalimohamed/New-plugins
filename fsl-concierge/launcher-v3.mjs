import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const parts=await Promise.all(Array.from({length:6},(_,i)=>readFile(join(here,'ui',`part-${String(i).padStart(2,'0')}.html`),'utf8')));
const augment=await readFile(join(here,'ui','v3-taskspace.html'),'utf8');
const assignmentUI=await readFile(join(here,'ui','assignment.html'),'utf8');
const jevUI=await readFile(join(here,'ui','jev-control.html'),'utf8');
const assignmentRoutes=await readFile(join(here,'assignment-routes.txt'),'utf8');
const jevRoutes=await readFile(join(here,'jev-routes.txt'),'utf8');
const bankingTheme=await readFile(join(here,'ui','banking-theme.css'),'utf8');
let html=parts.join('');
if(!html.includes('</body>')) throw new Error('Modern workspace UI is incomplete');
html=html.replace('<div class="brandmark">✦</div><small>Humanitarian AI</small><strong>Operations Concierge</strong>','<div class="brandmark">OC</div><small>Secure humanitarian workspace</small><strong>Operations Concierge</strong>');
html=html.replace('<div class="topcontext"><span class="live-dot"></span>','<div class="topcontext"><span class="securemark">SECURE</span><span class="live-dot"></span>');
html=html.replace('<div class="eyebrow">AI Concierge</div><h2>What would you like me to do?</h2>','<div class="eyebrow">Operations Concierge</div><h2>What would you like me to do?</h2>');
html=html.replace('Do the work ✦','Do the work');
html=html.replace('</body>',`${augment}\n${assignmentUI}\n${jevUI}\n<style>${bankingTheme}</style>\n</body>`);
await writeFile(join(here,'index-v3.html'),html);

let server=await readFile(join(here,'server-v3.mjs'),'utf8');
const marker="const session=requireWorker(req,res,url);if(!session)return;const uid=session.user_id;";
if(!server.includes(marker)) throw new Error('Could not locate worker route marker for assignment runtime');
server=server.replace(marker,`${marker}\n${jevRoutes}\n${assignmentRoutes}`);
await writeFile(join(here,'server-runtime.mjs'),server);
await import('./server-runtime.mjs');
