import { readFile, writeFile } from 'node:fs/promises';

function replaceRequired(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`Project context patch: ${label} marker not found`);
  return text.replace(search, replacement);
}

// Backend: every manually uploaded project document must belong to one active project.
const serverPath='server-v3.mjs';
let server=await readFile(serverPath,'utf8');
if(!server.includes('project-upload-scope-v1')){
  server=replaceRequired(
    server,
    "if(req.method==='POST'&&url.pathname==='/api/documents/upload'){const rawLength=Number(req.headers['content-length']||0);",
    "if(req.method==='POST'&&url.pathname==='/api/documents/upload'){/* project-upload-scope-v1 */const projectId=String(req.headers['x-project-id']||'').match(/^[0-9a-f-]{36}$/i)?.[0]||null;if(!projectId)return json(res,409,{ok:false,error:'Choose the project these documents belong to before uploading.',requires_project:true});const project=(await sb(`humanitarian_projects?select=id,name,status&id=eq.${projectId}&user_id=eq.${uid}&status=eq.active&limit=1`))?.[0];if(!project)return json(res,404,{ok:false,error:'That project is not available in your workspace.'});const rawLength=Number(req.headers['content-length']||0);",
    'document upload route'
  );
  server=replaceRequired(
    server,
    "JSON.stringify({user_id:uid,file_name:fileName,mime_type:mime,size_bytes:buffer.length,content_base64:buffer.toString('base64'),source:'manual_upload'",
    "JSON.stringify({user_id:uid,project_id:projectId,file_name:fileName,mime_type:mime,size_bytes:buffer.length,content_base64:buffer.toString('base64'),source:'manual_upload'",
    'manual document project id'
  );
  server=server.replace(
    "await audit(uid,'project_document_uploaded',{details:{file_name:fileName,size_bytes:buffer.length}});",
    "await audit(uid,'project_document_uploaded',{details:{project_id:projectId,project_name:project.name,file_name:fileName,size_bytes:buffer.length}});"
  );

  // Keep task evidence internally consistent with the work item's project.
  server=server.replace(
    "JSON.stringify({user_id:uid,item_id:itemId,work_product_id:workProductId,file_name:fileName",
    "JSON.stringify({user_id:uid,project_id:(exists||[])[0]?.project_id||null,item_id:itemId,work_product_id:workProductId,file_name:fileName"
  );
  server=server.replace(
    "buffer=await readBuffer(req);if(!buffer.length)return json(res,400,{ok:false,error:'The uploaded file is empty.'});const saved=await sb('concierge_task_documents'",
    "buffer=await readBuffer(req);if(!buffer.length)return json(res,400,{ok:false,error:'The uploaded file is empty.'});if(scope==='project'&&!(exists||[])[0]?.project_id)return json(res,409,{ok:false,error:'Assign this work item to a project before adding evidence to project memory.',requires_project_assignment:true});const saved=await sb('concierge_task_documents'"
  );

  // A project-enabled Concierge may not execute an unassigned work item.
  server=replaceRequired(
    server,
    "ctx=await gatherContext(uid,itemId);if(!ctx.item)return json(res,404,{ok:false,error:'Work item not found.'});const existing=await sb(",
    "ctx=await gatherContext(uid,itemId);if(!ctx.item)return json(res,404,{ok:false,error:'Work item not found.'});const projectConfig=(await conciergeWorkerConfig(uid))?.config||{},projectRequired=conciergeModuleEnabled(projectConfig,'projects');if(projectRequired&&!ctx.item.project_id)return json(res,409,{ok:false,error:'Assign this work item to a project before the Concierge does the work. This prevents evidence from different projects being mixed.',requires_project_assignment:true});const existing=await sb(",
    'work item project gate'
  );
  await writeFile(serverPath,server);
}

// Documents page: require a project choice and allow project filtering.
const part02Path='ui/part-02.html';
let part02=await readFile(part02Path,'utf8');
if(!part02.includes('id="uploadProjectSelect"')){
  const oldUpload='<div class="uploadbox"><div><strong>Add project evidence</strong><div class="small muted">PDF, Word, Excel, CSV, PowerPoint, text and images. Up to 15 MB per file.</div></div><div class="uploadmeta"><input id="fileInput" class="hidden" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp"><button id="uploadBtn" class="btn">Upload documents</button></div></div>';
  const newUpload='<div class="uploadbox"><div><strong>Add project evidence</strong><div class="small muted">Choose the project first. Files uploaded here are isolated to that project and used only when working in that project.</div></div><div class="uploadmeta" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id="uploadProjectSelect" class="searchbox" style="min-width:220px"><option value="">Choose project first…</option></select><input id="fileInput" class="hidden" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp"><button id="uploadBtn" class="btn">Upload documents</button></div></div>';
  part02=replaceRequired(part02,oldUpload,newUpload,'documents upload box');
  const oldToolbar='<div class="toolbar" style="margin-top:17px"><input id="docSearch" class="searchbox" placeholder="Search documents by name or category"><span id="docTag" class="tag">0 files</span></div>';
  const newToolbar='<div class="toolbar" style="margin-top:17px"><select id="docProjectFilter" class="searchbox" style="max-width:260px"><option value="">All projects</option></select><input id="docSearch" class="searchbox" placeholder="Search documents by name or category"><span id="docTag" class="tag">0 files</span></div>';
  part02=replaceRequired(part02,oldToolbar,newToolbar,'documents toolbar');
  await writeFile(part02Path,part02);
}

const part03Path='ui/part-03.html';
let part03=await readFile(part03Path,'utf8');
if(!part03.includes('project-doc-filter-v1')){
  const old="function renderDocs(filter=''){\n  const all=state.documents||[],q=filter.trim().toLowerCase(),d=q?all.filter(x=>`${x.file_name||''} ${x.category||''} ${x.description||''}`.toLowerCase().includes(q)):all;";
  const replacement="function renderDocs(filter=''){\n  /* project-doc-filter-v1 */\n  const projectId=$('docProjectFilter')?.value||'',all=(state.documents||[]).filter(x=>!projectId||x.project_id===projectId),q=filter.trim().toLowerCase(),d=q?all.filter(x=>`${x.file_name||''} ${x.category||''} ${x.description||''}`.toLowerCase().includes(q)):all;";
  part03=replaceRequired(part03,old,replacement,'document filtering');
  await writeFile(part03Path,part03);
}

const part04Path='ui/part-04.html';
let part04=await readFile(part04Path,'utf8');
if(!part04.includes('projectLabelForDocument')){
  const marker="{d.length} of ${all.length}`:`${all.length} file${all.length===1?'':'s'}`;";
  const insert="{d.length} of ${all.length}`:`${all.length} file${all.length===1?'':'s'}`;\n  const projectLabelForDocument=x=>x.project_id&&typeof projectName==='function'?projectName(x.project_id):'Unassigned';";
  part04=replaceRequired(part04,marker,insert,'document project label helper');
  const oldMeta="<div class=\"small muted\">${esc(x.category||'Project Document')} · ${size(x.size_bytes)} · ${when(x.created_at)}</div>";
  const newMeta="<div class=\"small muted\">${esc(projectLabelForDocument(x))} · ${esc(x.category||'Project Document')} · ${size(x.size_bytes)} · ${when(x.created_at)}</div>";
  part04=replaceRequired(part04,oldMeta,newMeta,'document project label');
  await writeFile(part04Path,part04);
}

const part05Path='ui/part-05.html';
let part05=await readFile(part05Path,'utf8');
if(!part05.includes('project-upload-ui-v1')){
  const uploadPattern=/async function uploadFiles\(files\)\{[\s\S]*?\}\n\n\$\('refresh'\)/;
  if(!uploadPattern.test(part05))throw new Error('Project context patch: uploadFiles function not found');
  const uploadReplacement="async function uploadFiles(files){/* project-upload-ui-v1 */const arr=[...files];if(!arr.length)return;const projectId=$('uploadProjectSelect')?.value||window.conciergeActiveProjectId||'';if(!projectId){toast('Choose the project before uploading documents.');setPage('documents');return}const bad=arr.find(f=>f.size>15*1024*1024);if(bad){toast(`${bad.name} exceeds 15 MB`);return}$('uploadBtn').disabled=true;$('progress').style.display='block';for(let i=0;i<arr.length;i++){const f=arr[i];$('uploadStatus').textContent=`Uploading ${i+1} of ${arr.length}: ${f.name}`;$('progress').firstElementChild.style.width=`${Math.round((i/arr.length)*100)}%`;const r=await api('/api/documents/upload',{method:'POST',headers:{'content-type':f.type||'application/octet-stream','x-file-name':encodeURIComponent(f.name),'x-file-description':encodeURIComponent('Verified project evidence uploaded by user'),'x-project-id':projectId},body:f});if(!r.ok){const e=await r.json().catch(()=>({}));toast(e.error||`Could not upload ${f.name}`);$('uploadBtn').disabled=false;return}}$('progress').firstElementChild.style.width='100%';$('uploadStatus').textContent=`Uploaded ${arr.length} file${arr.length===1?'':'s'} to ${typeof projectName==='function'?projectName(projectId):'the selected project'}.`;toast('Project documents added');$('uploadBtn').disabled=false;$('fileInput').value='';setTimeout(()=>{$('progress').style.display='none'},700);await load();if(typeof projectLoad==='function')await projectLoad()}\n\n$('refresh')";
  part05=part05.replace(uploadPattern,uploadReplacement);
  part05=replaceRequired(
    part05,
    "$('docSearch').oninput=e=>renderDocs(e.target.value);",
    "$('docSearch').oninput=e=>renderDocs(e.target.value);$('docProjectFilter').onchange=()=>renderDocs($('docSearch').value);",
    'document filter event'
  );
  await writeFile(part05Path,part05);
}

// Project Intelligence owns the active project and syncs that selection to documents and commands.
const projectUiPath='ui/project-intelligence.html';
let projectUi=await readFile(projectUiPath,'utf8');
if(!projectUi.includes('project-active-context-v1')){
  const nameMarker="const projectName=id=>projectState.projects.find(p=>p.id===id)?.name||'Unassigned';";
  const activeFns="\n// project-active-context-v1\nfunction projectSyncDocumentSelectors(){\n  const active=(projectState.projects||[]).filter(p=>p.status==='active'),activeId=window.conciergeActiveProjectId||'';\n  const upload=$('uploadProjectSelect'),filter=$('docProjectFilter');\n  if(upload){const previous=upload.value||activeId;upload.innerHTML='<option value=\"\">Choose project first…</option>'+active.map(p=>`<option value=\"${p.id}\">${esc(p.name)}${p.code?' · '+esc(p.code):''}</option>`).join('');if(active.some(p=>p.id===previous))upload.value=previous;else if(active.length===1)upload.value=active[0].id}\n  if(filter){const previous=activeId||filter.value;filter.innerHTML='<option value=\"\">All projects</option>'+active.map(p=>`<option value=\"${p.id}\">${esc(p.name)}${p.code?' · '+esc(p.code):''}</option>`).join('');if(active.some(p=>p.id===previous))filter.value=previous}\n}\nfunction projectCloseActive(){projectState.selected=null;window.conciergeActiveProjectId=null;$('projectDetail').innerHTML='';projectSyncDocumentSelectors();if($('docProjectFilter')){$('docProjectFilter').value='';renderDocs($('docSearch')?.value||'')}}\nfunction projectUploadDocuments(id){window.conciergeActiveProjectId=id;projectState.selected=id;projectSyncDocumentSelectors();const s=$('uploadProjectSelect');if(s)s.value=id;setPage('documents');setTimeout(()=>$('fileInput')?.click(),80)}\n";
  projectUi=replaceRequired(projectUi,nameMarker,`${nameMarker}${activeFns}`,'active project helpers');
  projectUi=replaceRequired(
    projectUi,
    "projectState.projects=d.projects||[];projectState.unassigned=d.unassigned||{};",
    "projectState.projects=d.projects||[];projectSyncDocumentSelectors();projectState.unassigned=d.unassigned||{};",
    'project selector sync'
  );
  projectUi=replaceRequired(
    projectUi,
    "async function projectOpen(id,quiet=false){projectState.selected=id;const root=$('projectDetail');",
    "async function projectOpen(id,quiet=false){projectState.selected=id;window.conciergeActiveProjectId=id;projectSyncDocumentSelectors();const root=$('projectDetail');",
    'project open context'
  );
  projectUi=replaceRequired(
    projectUi,
    "<div class=\"project-actions\"><button class=\"btn secondary smallbtn\" onclick=\"projectRoute('${p.id}')\">Route new evidence</button><button class=\"btn secondary smallbtn\" onclick=\"projectState.selected=null;$('projectDetail').innerHTML=''\">Close</button></div>",
    "<div class=\"project-actions\"><button class=\"btn smallbtn\" onclick=\"projectUploadDocuments('${p.id}')\">Upload documents</button><button class=\"btn secondary smallbtn\" onclick=\"projectRoute('${p.id}')\">Route new evidence</button><button class=\"btn secondary smallbtn\" onclick=\"projectCloseActive()\">Close</button></div>",
    'project detail actions'
  );
  await writeFile(projectUiPath,projectUi);
}

// “Do the work” should inherit the project currently open in Project Intelligence.
const commandUiPath='ui/command-center.html';
let commandUi=await readFile(commandUiPath,'utf8');
if(!commandUi.includes('active-project-command-v1')){
  commandUi=replaceRequired(
    commandUi,
    "try{const d=await conciergeExecuteCommand(q);if(!d)return;",
    "try{/* active-project-command-v1 */const d=await conciergeExecuteCommand(q,window.conciergeActiveProjectId||null);if(!d)return;",
    'command active project'
  );
  await writeFile(commandUiPath,commandUi);
}

console.log('Project context patch applied');
