import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const parts=await Promise.all(Array.from({length:6},(_,i)=>readFile(join(here,'ui',`part-${String(i).padStart(2,'0')}.html`),'utf8')));
const augment=await readFile(join(here,'ui','v3-taskspace.html'),'utf8');
const assignmentUI=await readFile(join(here,'ui','assignment.html'),'utf8');
const jevUI=await readFile(join(here,'ui','jev-control.html'),'utf8');
const deadlineUI=await readFile(join(here,'ui','deadline-calendar.html'),'utf8');
let projectUI=await readFile(join(here,'ui','project-intelligence.html'),'utf8');
const adminSetupUI=await readFile(join(here,'ui','admin-setup-engine.html'),'utf8');
const assignmentRoutes=await readFile(join(here,'assignment-routes.txt'),'utf8');
const jevRoutes=await readFile(join(here,'jev-routes.txt'),'utf8');
const projectRoutes=await readFile(join(here,'project-routes.txt'),'utf8');
const projectUnassignedRoutes=await readFile(join(here,'project-unassigned-routes.txt'),'utf8');
const adminAssessmentRoutes=await readFile(join(here,'admin-assessment-routes.txt'),'utf8');
const adminSetupRoutes=await readFile(join(here,'admin-setup-routes.txt'),'utf8');
const bankingTheme=await readFile(join(here,'ui','banking-theme.css'),'utf8');

const projectCompatNeedle='page.innerHTML=`<div id="projectIntelligenceRoot">';
const projectCompatReplacement='page.innerHTML=`<div id="memory" class="hidden"></div><div id="attention" class="hidden"></div><span id="attentionTag" class="hidden"></span><div id="projectIntelligenceRoot">';
if(!projectUI.includes(projectCompatNeedle)) throw new Error('Could not install Project Intelligence compatibility targets');
projectUI=projectUI.replace(projectCompatNeedle,projectCompatReplacement);

let html=parts.join('');
if(!html.includes('</body>')) throw new Error('Modern workspace UI is incomplete');
html=html.replace('<div class="brandmark">✦</div><small>Humanitarian AI</small><strong>Operations Concierge</strong>','<div class="brandmark">OC</div><small>Secure humanitarian workspace</small><strong>Operations Concierge</strong>');
html=html.replace('<div class="topcontext"><span class="live-dot"></span>','<div class="topcontext"><span class="securemark">SECURE</span><span class="live-dot"></span>');
html=html.replace('<div class="eyebrow">AI Concierge</div><h2>What would you like me to do?</h2>','<div class="eyebrow">Operations Concierge</div><h2>What would you like me to do?</h2>');
html=html.replace('Do the work ✦','Do the work');
html=html.replace('</body>',`${augment}\n${assignmentUI}\n${jevUI}\n${deadlineUI}\n${projectUI}\n<style>${bankingTheme}</style>\n</body>`);
await writeFile(join(here,'index-v3.html'),html);

let adminHtml=await readFile(join(here,'admin.html'),'utf8');
if(!adminHtml.includes('</body>'))throw new Error('Admin UI is incomplete');
adminHtml=adminHtml.replace('</body>',`${adminSetupUI}\n</body>`);
await writeFile(join(here,'admin-runtime.html'),adminHtml);

let server=await readFile(join(here,'server-v3.mjs'),'utf8');
const marker="const session=requireWorker(req,res,url);if(!session)return;const uid=session.user_id;";
if(!server.includes(marker)) throw new Error('Could not locate worker route marker for runtime augmentation');
server=server.replace(marker,`${adminAssessmentRoutes}\n${adminSetupRoutes}\n${marker}\n${projectUnassignedRoutes}\n${projectRoutes}\n${jevRoutes}\n${assignmentRoutes}`);
server=server.replace("if(url.pathname==='/admin')return sendFile(res,join(ROOT,'admin.html'),'text/html; charset=utf-8');","if(url.pathname==='/admin')return sendFile(res,join(ROOT,'admin-runtime.html'),'text/html; charset=utf-8');");

const scopedGather=`async function gatherContext(uid,itemId){
  const itemRows=await sb(\`fsl_concierge_items?select=*&id=eq.\${itemId}&user_id=eq.\${uid}&limit=1\`),item=(itemRows||[])[0]||null;
  if(!item)return{item:null,memory:[],reports:[],projectDocs:[],taskDocs:[]};
  const projectFilter=item.project_id?\`project_id=eq.\${item.project_id}\`:'project_id=is.null';
  const[memory,reports,projectDocs,taskDocs]=await Promise.all([
    sb(\`fsl_concierge_memory?select=*&user_id=eq.\${uid}&\${projectFilter}&order=updated_at.desc&limit=20\`),
    sb(\`fsl_concierge_reports?select=*&user_id=eq.\${uid}&\${projectFilter}&order=updated_at.desc&limit=5\`),
    sb(\`fsl_concierge_documents?select=id,project_id,file_name,mime_type,size_bytes,content_base64,category,description,created_at&user_id=eq.\${uid}&\${projectFilter}&status=eq.available&order=created_at.desc&limit=8\`),
    sb(\`concierge_task_documents?select=*&user_id=eq.\${uid}&item_id=eq.\${itemId}&status=eq.available&order=created_at.desc&limit=8\`)
  ]);
  return{item,memory:memory||[],reports:reports||[],projectDocs:projectDocs||[],taskDocs:taskDocs||[]}
}`;
const gatherPattern=/async function gatherContext\(uid,itemId\)\{[\s\S]*?\}\nfunction contextText/;
if(!gatherPattern.test(server)) throw new Error('Could not install project-scoped evidence gathering');
server=server.replace(gatherPattern,`${scopedGather}\nfunction contextText`);
server=server.replace('select=id,file_name,mime_type,size_bytes,source,category,description,uploaded_by,status,created_at,updated_at&user_id=', 'select=id,project_id,file_name,mime_type,size_bytes,source,category,description,uploaded_by,status,created_at,updated_at&user_id=');
server=server.replace('select=id,item_id,parent_work_product_id,product_type,title,subject,state,current_version,web_search_enabled,missing_information,approved_at,sent_at,updated_at&user_id=', 'select=id,project_id,item_id,parent_work_product_id,product_type,title,subject,state,current_version,web_search_enabled,missing_information,approved_at,sent_at,updated_at&user_id=');
server=server.replace('const itemId=taskUpload[1],exists=await sb(`fsl_concierge_items?select=id&id=eq.${itemId}&user_id=eq.${uid}&limit=1`);', 'const itemId=taskUpload[1],exists=await sb(`fsl_concierge_items?select=id,project_id&id=eq.${itemId}&user_id=eq.${uid}&limit=1`);');
server=server.replace("JSON.stringify({user_id:uid,file_name:fileName,mime_type:mime,size_bytes:buffer.length,content_base64:buffer.toString('base64'),source:'task_upload'", "JSON.stringify({user_id:uid,project_id:(exists||[])[0]?.project_id||null,file_name:fileName,mime_type:mime,size_bytes:buffer.length,content_base64:buffer.toString('base64'),source:'task_upload'");
await writeFile(join(here,'server-runtime.mjs'),server);
await import('./server-runtime.mjs');
