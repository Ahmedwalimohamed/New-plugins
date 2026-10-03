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
const setupStatusUI=await readFile(join(here,'ui','setup-status.html'),'utf8');
const commandCenterUI=await readFile(join(here,'ui','command-center.html'),'utf8');
const adminSetupUI=await readFile(join(here,'ui','admin-setup-engine.html'),'utf8');
const assignmentRoutes=await readFile(join(here,'assignment-routes.txt'),'utf8');
const jevRoutes=await readFile(join(here,'jev-routes.txt'),'utf8');
const commandRoutes=await readFile(join(here,'concierge-command-routes.txt'),'utf8');
const projectRoutes=await readFile(join(here,'project-routes.txt'),'utf8');
const projectUnassignedRoutes=await readFile(join(here,'project-unassigned-routes.txt'),'utf8');
const workerSetupRoutes=await readFile(join(here,'worker-setup-routes.txt'),'utf8');
const universalRoutes=await readFile(join(here,'universal-multiuser-routes.txt'),'utf8');
const adminAssessmentRoutes=await readFile(join(here,'admin-assessment-routes.txt'),'utf8');
let adminSetupRoutes=await readFile(join(here,'admin-setup-routes.txt'),'utf8');
const setupConfigBug="const config=setupConfigFrom(map,jd),status=";
const setupConfigFix="const config=setupConfigFrom(map,jd.answers||{},jd),status=";
if(!adminSetupRoutes.includes(setupConfigBug)) throw new Error('Could not locate Concierge setup generation wiring');
adminSetupRoutes=adminSetupRoutes.replace(setupConfigBug,setupConfigFix).replace("{id:'home',label:'Cross-project Home'","{id:'home',label:'Operations Home'");

// Keep the legacy approval implementation buildable, but universalRoutes handles approval first
// and guarantees that every approved profile is linked and applied to a specific worker.
const approveOld="const updated=await sb(`concierge_setup_profiles?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'approved',admin_note:clean(b.admin_note,2000)||null,approved_by:admin.username||admin.name||'admin',approved_at:now(),updated_at:now()})});\n  await sb(`concierge_workflow_maps?id=eq.${p.workflow_map_id}`,{method:'PATCH',body:JSON.stringify({status:'approved',updated_at:now()})});\n  return json(res,200,{ok:true,profile:(updated||[])[0]||null});";
const approveNew="const approvedAt=now();\n  const updated=await sb(`concierge_setup_profiles?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'approved',admin_note:clean(b.admin_note,2000)||null,approved_by:admin.username||admin.name||'admin',approved_at:approvedAt,updated_at:approvedAt})});\n  await sb(`concierge_workflow_maps?id=eq.${p.workflow_map_id}`,{method:'PATCH',body:JSON.stringify({status:'approved',updated_at:approvedAt})});\n  let applied=false;if(p.worker_user_id){await sb('concierge_worker_configs?on_conflict=worker_user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({worker_user_id:p.worker_user_id,setup_profile_id:p.id,setup_version:p.setup_version||'concierge-setup-v1',config:p.setup_config||{},status:'active',applied_at:approvedAt,updated_at:approvedAt})});await sb(`concierge_setup_profiles?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({applied_at:approvedAt,updated_at:approvedAt})});applied=true;}\n  return json(res,200,{ok:true,applied,profile:{...((updated||[])[0]||p),applied_at:applied?approvedAt:null}});";
if(!adminSetupRoutes.includes(approveOld)) throw new Error('Could not locate setup approval application bridge');
adminSetupRoutes=adminSetupRoutes.replace(approveOld,approveNew);
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
html=html.replace('Do the work ✦','Do the work').replaceAll('i.needs_user??i.needs_hibo','i.needs_user');
html=html.replace('</body>',`${augment}\n${assignmentUI}\n${jevUI}\n${deadlineUI}\n${projectUI}\n${setupStatusUI}\n${commandCenterUI}\n<style>${bankingTheme}</style>\n</body>`);
await writeFile(join(here,'index-v3.html'),html);

let adminHtml=await readFile(join(here,'admin.html'),'utf8');
if(!adminHtml.includes('</body>'))throw new Error('Admin UI is incomplete');
adminHtml=adminHtml.replace('</body>',`${adminSetupUI}\n</body>`);
await writeFile(join(here,'admin-runtime.html'),adminHtml);

let server=await readFile(join(here,'server-v3.mjs'),'utf8');
server=server.replace("const adminHtml=await readFile(join(__dirname,'admin.html'));","const adminHtml=await readFile(join(__dirname,'admin-runtime.html'));");
const marker="const session=requireWorker(req,res,url);if(!session)return;const uid=session.user_id;";
if(!server.includes(marker)) throw new Error('Could not locate worker route marker for runtime augmentation');
server=server.replace(marker,`${adminAssessmentRoutes}\n${universalRoutes}\n${adminSetupRoutes}\n${marker}\n${workerSetupRoutes}\n${projectUnassignedRoutes}\n${projectRoutes}\n${jevRoutes}\n${commandRoutes}\n${assignmentRoutes}`);

const scopedGather=`async function gatherContext(uid,itemId){
  const itemRows=await sb(\`fsl_concierge_items?select=*&id=eq.\${itemId}&user_id=eq.\${uid}&limit=1\`),item=(itemRows||[])[0]||null;
  if(!item)return{item:null,memory:[],reports:[],projectDocs:[],taskDocs:[]};
  const applied=await conciergeWorkerConfig(uid),config=applied?.config||{},projectEnabled=conciergeModuleEnabled(config,'projects'),useDocs=conciergeModuleEnabled(config,'documents'),useReports=conciergeModuleEnabled(config,'reports');
  const projectFilter=projectEnabled&&item.project_id?\`project_id=eq.\${item.project_id}\`:'project_id=is.null';
  const[memory,reports,projectDocs,taskDocs]=await Promise.all([
    sb(\`fsl_concierge_memory?select=*&user_id=eq.\${uid}&\${projectFilter}&order=updated_at.desc&limit=20\`),
    useReports?sb(\`fsl_concierge_reports?select=*&user_id=eq.\${uid}&\${projectFilter}&order=updated_at.desc&limit=5\`):Promise.resolve([]),
    useDocs?sb(\`fsl_concierge_documents?select=id,project_id,file_name,mime_type,size_bytes,content_base64,category,description,created_at&user_id=eq.\${uid}&\${projectFilter}&status=eq.available&order=created_at.desc&limit=8\`):Promise.resolve([]),
    useDocs?sb(\`concierge_task_documents?select=*&user_id=eq.\${uid}&item_id=eq.\${itemId}&status=eq.available&order=created_at.desc&limit=8\`):Promise.resolve([])
  ]);
  return{item,memory:memory||[],reports:reports||[],projectDocs:projectDocs||[],taskDocs:taskDocs||[],setupConfig:config}
}`;
const gatherPattern=/async function gatherContext\(uid,itemId\)\{[\s\S]*?\}\nfunction contextText/;
if(!gatherPattern.test(server)) throw new Error('Could not install setup-aware evidence gathering');
server=server.replace(gatherPattern,`${scopedGather}\nfunction contextText`);
server=server.replaceAll('item.needs_user??item.needs_hibo','item.needs_user').replaceAll('x.needs_user??x.needs_hibo','x.needs_user').replaceAll('i.needs_user??i.needs_hibo','i.needs_user');
server=server.replace('select=id,file_name,mime_type,size_bytes,source,category,description,uploaded_by,status,created_at,updated_at&user_id=', 'select=id,project_id,file_name,mime_type,size_bytes,source,category,description,uploaded_by,status,created_at,updated_at&user_id=');
server=server.replace('select=id,item_id,parent_work_product_id,product_type,title,subject,state,current_version,web_search_enabled,missing_information,approved_at,sent_at,updated_at&user_id=', 'select=id,project_id,item_id,parent_work_product_id,product_type,title,subject,state,current_version,web_search_enabled,missing_information,approved_at,sent_at,updated_at&user_id=');
server=server.replace('const itemId=taskUpload[1],exists=await sb(`fsl_concierge_items?select=id&id=eq.${itemId}&user_id=eq.${uid}&limit=1`);', 'const itemId=taskUpload[1],exists=await sb(`fsl_concierge_items?select=id,project_id&id=eq.${itemId}&user_id=eq.${uid}&limit=1`);');
server=server.replace("JSON.stringify({user_id:uid,file_name:fileName,mime_type:mime,size_bytes:buffer.length,content_base64:buffer.toString('base64'),source:'task_upload'", "JSON.stringify({user_id:uid,project_id:(exists||[])[0]?.project_id||null,file_name:fileName,mime_type:mime,size_bytes:buffer.length,content_base64:buffer.toString('base64'),source:'task_upload'");
server=server.replace('const row={user_id:uid,item_id:itemId,product_type:', 'const row={user_id:uid,project_id:ctx.item.project_id||null,item_id:itemId,product_type:');
await writeFile(join(here,'server-runtime.mjs'),server);
await import('./server-runtime.mjs');