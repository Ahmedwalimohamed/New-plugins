import { readFile, writeFile } from 'node:fs/promises';

// Runtime hardening for the email ingestion gate and workspace layout.
// This is intentionally idempotent because Railway runs it on every container start.

const syncPath='source-sync-core.txt';
let sync=await readFile(syncPath,'utf8');

const ingestMarker='async function sourceIngestMessage(uid,account,message){';
if(!sync.includes('function sourceOperationallyRelevant(message)')){
  const relevance=`
function sourceOperationallyRelevant(message){
  const sender=String(message?.sender_email||'').trim().toLowerCase();
  const subject=String(message?.subject||'').toLowerCase();
  const body=String(message?.body_text||'').toLowerCase();
  const text=\`${subject} ${body}\`;
  const domain=sender.includes('@')?sender.split('@').pop():sender;
  const blockedDomains=['email.apple.com','accounts.google.com','microsoftrewards.com','linkedin.com','alison.com','academia-mail.com','udemy.com','eldtraining.com','impactpool.org','learn.inasp.info','umd.edu'];
  const negative=/\\b(billing problem|security alert|sale starts|sale ends|bonus points|subscription confirmed|course is ready|start learning|certificate holders|popular in your network|mentioned in .* papers|weekly:|newsletter|unsubscribe|promotional|special offer|limited time|career growth|job alert)\\b/i.test(text);
  const workDomains=['nrc.no','iom.int','fao.org','wfp.org','unicef.org','unhcr.org','unocha.org','ocha.org','undp.org','who.int','icrc.org','ifrc.org','drc.ngo','rescue.org','savethechildren.net','savethechildren.org','mercycorps.org','care.org','oxfam.org','acted.org','worldvision.org','unops.org','unwomen.org'];
  const strongWork=/\\b(food security|livelihoods?|fsl|beneficiar(?:y|ies)|distribution|cash transfer|cash assistance|voucher|field report|site report|situation report|sitrep|workplan|work plan|implementation update|project implementation|project report|monthly report|weekly report|donor report|proposal|budget revision|procurement|logistics|monitoring|indicator|baseline|endline|assessment|stakeholder|site visit|humanitarian|emergency response|emergency trend|dtm|cluster meeting|meeting minutes|activity report|field team)\\b/i.test(text);
  if(blockedDomains.some(d=>domain===d||domain.endsWith('.'+d)))return false;
  if(negative&&!strongWork)return false;
  if(workDomains.some(d=>domain===d||domain.endsWith('.'+d)))return true;
  return strongWork;
}
async function sourceShouldIngest(uid,message){
  const sender=String(message?.sender_email||'').trim().toLowerCase();
  try{
    const [projects,trusted]=await Promise.all([
      sb(\`humanitarian_projects?select=id,name,code,aliases,status&user_id=eq.${uid}&status=neq.archived\`),
      sb(\`fsl_concierge_email_sources?select=email,is_active&user_id=eq.${uid}&is_active=eq.true&limit=200\`)
    ]);
    if((trusted||[]).some(x=>String(x.email||'').trim().toLowerCase()===sender))return true;
    if(sourceMatchProject(message,projects||[],null))return true;
  }catch{}
  return sourceOperationallyRelevant(message);
}
`;
  if(!sync.includes(ingestMarker))throw new Error('Relevance patch: ingest marker not found');
  sync=sync.replace(ingestMarker,`${relevance.trim()}\n${ingestMarker}`);
}

const guardedIngest='async function sourceIngestMessage(uid,account,message){if(!(await sourceShouldIngest(uid,message)))return{created:false,ignored:true};';
if(!sync.includes(guardedIngest)){
  if(!sync.includes(ingestMarker))throw new Error('Relevance patch: ingest function not found');
  sync=sync.replace(ingestMarker,guardedIngest);
}
await writeFile(syncPath,sync);

const uiPath='ui/part-01.html';
let ui=await readFile(uiPath,'utf8');
if(!ui.includes('/* concierge-overflow-hardening */')){
  const css=`
/* concierge-overflow-hardening */
.homegrid,.homegrid>* ,.stack,.card,.row,.rowtop,.sourceHealthRow,.sourceHealthMain{min-width:0}
.rowtop>div:first-child,.sourceHealthMain>div{min-width:0;flex:1}
.row,.row h4,.rowtop>div,.source,.empty,.answer,.emaildraft,.accountcard,.sourcecard,.doc,.sourceHealthMain{overflow-wrap:anywhere;word-break:break-word}
#actions .row,#intelligence .row,#taskActions .row,#taskWatches .row{overflow:hidden}
#actions .row .rowtop>div:first-child>div:not(.source),#intelligence .row .rowtop>div:first-child>div:not(.source),#taskActions .row .rowtop>div:first-child>div:not(.source),#taskWatches .row .rowtop>div:first-child>div:not(.source){display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
#actions a,#intelligence a,#taskActions a,#taskWatches a{max-width:100%;overflow:hidden;text-overflow:ellipsis}
`;
  const marker='.mobilebar{display:none}';
  if(!ui.includes(marker))throw new Error('UI hardening patch: CSS marker not found');
  ui=ui.replace(marker,`${marker}\n${css.trim()}`);
  await writeFile(uiPath,ui);
}

// "Do the work" must finish the deliverable, not stop at draft/review.
// Internal outputs are completed automatically when evidence is sufficient.
// Email/external actions remain ready for explicit human approval before sending.
const commandPath='concierge-command-routes.txt';
let command=await readFile(commandPath,'utf8');
if(!command.includes('concierge-auto-complete-v1')){
  const marker="const qa=await jevRun('work_product',product.id,'draft_generated');await audit(uid,'concierge_command_completed'";
  if(!command.includes(marker))throw new Error('Do-work patch: command completion marker not found');
  const replacement=`const qa=await jevRun('work_product',product.id,'draft_generated');
  // concierge-auto-complete-v1
  const missingNow=fmtArray(row.missing_information);
  if(!missingNow.length){
    const finishedAt=now();
    if(product.product_type==='email'){
      await sb(\`concierge_work_products?id=eq.\${product.id}&user_id=eq.\${uid}\`,{method:'PATCH',body:JSON.stringify({state:'ready_to_send',updated_at:finishedAt})});
      await sb(\`fsl_concierge_items?id=eq.\${item.id}&user_id=eq.\${uid}\`,{method:'PATCH',body:JSON.stringify({workflow_state:'ready_to_send',updated_at:finishedAt})});
    }else{
      await sb(\`concierge_work_products?id=eq.\${product.id}&user_id=eq.\${uid}\`,{method:'PATCH',body:JSON.stringify({state:'completed',updated_at:finishedAt})});
      await sb(\`fsl_concierge_items?id=eq.\${item.id}&user_id=eq.\${uid}\`,{method:'PATCH',body:JSON.stringify({status:'completed',needs_user:false,workflow_state:'completed',completed_at:finishedAt,completion_note:'Completed by Concierge from verified project evidence. No external action was taken.',updated_at:finishedAt})});
    }
  }
  await audit(uid,'concierge_command_completed'`;
  command=command.replace(marker,replacement);
  await writeFile(commandPath,command);
}

// Make the result message match the real lifecycle state.
const commandUiPath='ui/command-center.html';
let commandUi=await readFile(commandUiPath,'utf8');
if(!commandUi.includes('concierge-completion-message-v1')){
  const old="jevItemId=d.item?.id||null;jevRenderBundle(d.bundle);$('answer').innerHTML=`<div class=\"answer\">Work product created from your verified evidence. Jev QA: ${esc(String(d.qa?.route||'review').toUpperCase())}. Review and approve before final use.</div>`;await load()";
  const replacement=`jevItemId=d.item?.id||null;jevRenderBundle(d.bundle);/* concierge-completion-message-v1 */const productState=d.bundle?.product?.state||'reviewing',qaLabel=esc(String(d.qa?.route||'review').toUpperCase()),completionMessage=productState==='completed'?'Work completed from your verified project evidence. No external action was taken.':productState==='ready_to_send'?'Draft completed and ready for your approval before sending.': 'Work completed as far as the verified evidence allows. Review the missing information before final use.';$('answer').innerHTML=\`<div class=\"answer\">\${completionMessage} Jev QA: \${qaLabel}.</div>\`;await load()`;
  if(!commandUi.includes(old))throw new Error('Do-work patch: command UI marker not found');
  commandUi=commandUi.replace(old,replacement);
  await writeFile(commandUiPath,commandUi);
}
