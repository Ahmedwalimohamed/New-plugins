import { readFile, writeFile } from 'node:fs/promises';

// Invitation delivery hardening.
// 1) Prefer the configured Resend sender when its domain can send.
// 2) Fall back to another verified sending-enabled Resend domain in the same account.
// 3) Provide an admin retry flow that always returns a fresh secure activation link.

const routesPath='universal-multiuser-routes.txt';
let routes=await readFile(routesPath,'utf8');

if(!routes.includes('concierge-resend-domain-fallback-v1')){
  const fnPattern=/async function conciergeSendInviteEmail\(\{email,name,username,url\}\)\{[\s\S]*?\n\}\nasync function conciergeIssueInvitation/;
  if(!fnPattern.test(routes))throw new Error('Invite patch: send function not found');
  const replacement=`async function conciergeResolveInviteSender(apiKey,configuredFrom){
  // concierge-resend-domain-fallback-v1
  const raw=String(configuredFrom||'').trim();
  const configuredDomain=(raw.match(/@([^>\\s]+)>?$/)||[])[1]?.toLowerCase()||'';
  try{
    const r=await fetch('https://api.resend.com/domains?limit=100',{headers:{authorization:\`Bearer \${apiKey}\`,accept:'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(r.ok){
      const domains=Array.isArray(d?.data)?d.data:Array.isArray(d)?d:[];
      const canSend=x=>Boolean(x?.name)&&((x.status==='verified')||(x?.capabilities?.sending==='enabled'))&&x?.capabilities?.sending!=='disabled';
      const configured=domains.find(x=>String(x?.name||'').toLowerCase()===configuredDomain);
      if(configured&&canSend(configured))return{from:raw,source:'configured',domain:configured.name};
      const fallback=domains.find(canSend);
      if(fallback)return{from:\`Operations Concierge <invite@\${fallback.name}>\`,source:'verified_fallback',domain:fallback.name};
    }
  }catch(e){console.error('invite sender discovery',String(e?.message||e).slice(0,180))}
  return{from:raw,source:'configured_unverified',domain:configuredDomain||null};
}
async function conciergeSendInviteEmail({email,name,username,url}){
  const apiKey=process.env.RESEND_API_KEY||'',configuredFrom=process.env.INVITE_FROM_EMAIL||'';
  if(!apiKey||!configuredFrom)return{sent:false,provider:'not_configured',error:'Transactional email is not configured.'};
  const sender=await conciergeResolveInviteSender(apiKey,configuredFrom),from=sender.from;
  const subject='Your Operations Concierge is ready';
  const html=\`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17242d"><div style="padding:24px 0;border-bottom:1px solid #dce3e8"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#557684;font-weight:700">Humanitarian Operations Concierge</div><h1 style="font-size:26px;margin:7px 0 0">Your Concierge is ready</h1></div><div style="padding:26px 0"><p>Hello \${esc(name)},</p><p>Your workflow assessment has been reviewed and your Operations Concierge has been prepared.</p><p><b>Username:</b> \${esc(username)}</p><p style="margin:26px 0"><a href="\${esc(url)}" style="background:#0f6c8e;color:#fff;text-decoration:none;padding:13px 18px;border-radius:8px;font-weight:700">Activate your Concierge</a></p><p>This secure activation link expires in 48 hours. You will create your own password; no password is sent by email.</p><p style="color:#687984;font-size:13px">After activation, you will choose which work email and document sources to connect. Your contact email is not read as a work source unless you explicitly connect it later.</p></div></div>\`;
  try{
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:\`Bearer \${apiKey}\`,'content-type':'application/json'},body:JSON.stringify({from,to:[email],subject,html})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)return{sent:false,provider:'resend',error:clean(d?.message||\`Resend \${r.status}\`,500),sender_domain:sender.domain,sender_source:sender.source};
    return{sent:true,provider:'resend',id:d.id||null,error:null,sender_domain:sender.domain,sender_source:sender.source};
  }catch(e){return{sent:false,provider:'resend',error:clean(e.message,500),sender_domain:sender.domain,sender_source:sender.source}}
}
async function conciergeIssueInvitation`;
  routes=routes.replace(fnPattern,replacement);
}

if(!routes.includes('concierge-invite-retry-v1')){
  const marker='const activationToken=()=>clean(url.searchParams.get(\'token\'),200);';
  if(!routes.includes(marker))throw new Error('Invite patch: activation marker not found');
  const retry=`// concierge-invite-retry-v1
const inviteRetry=url.pathname.match(/^\\/api\\/admin\\/invitations\\/([0-9a-f-]{36})\\/retry$/i);
if(req.method==='POST'&&inviteRetry){
  const admin=requireAdmin(req,res,url);if(!admin)return;
  const old=(await sb(\`concierge_worker_invitations?select=*&id=eq.\${inviteRetry[1]}&limit=1\`))?.[0];
  if(!old)return json(res,404,{ok:false,error:'Invitation not found.'});
  if(old.status==='activated')return json(res,409,{ok:false,error:'This account is already activated.'});
  const worker=await conciergeWorkerExists(old.worker_user_id);if(!worker)return json(res,404,{ok:false,error:'Worker account not found.'});
  const profile=(await sb(\`concierge_setup_profiles?select=*&id=eq.\${old.setup_profile_id}&limit=1\`))?.[0];
  if(!profile)return json(res,404,{ok:false,error:'Concierge setup profile not found.'});
  const invitation=await conciergeIssueInvitation(profile,worker,String(old.contact_email||worker.contact_email||'').trim().toLowerCase());
  await audit(worker.id,'concierge_invitation_retried',{details:{previous_invitation_id:old.id,new_invitation_id:invitation.invitation_id,delivery_status:invitation.status,approved_by:admin.username||admin.name||'admin'}});
  return json(res,200,{ok:true,invitation,worker:{id:worker.id,full_name:worker.full_name,username:worker.username,contact_email:worker.contact_email}})
}
`;
  routes=routes.replace(marker,`${retry}\n${marker}`);
}
await writeFile(routesPath,routes);

const uiPath='ui/admin-setup-engine.html';
let ui=await readFile(uiPath,'utf8');
if(!ui.includes('setupRenderInviteRecovery')){
  const renderNeedle='    setupRender();\n';
  if(!ui.includes(renderNeedle))throw new Error('Invite patch: admin render marker not found');
  ui=ui.replace(renderNeedle,'    setupRender();setupRenderInviteRecovery();\n');
  const fnNeedle='window.generateSetup=async(id,btn)=>';
  if(!ui.includes(fnNeedle))throw new Error('Invite patch: admin action marker not found');
  const recovery=`function setupRenderInviteRecovery(){
  const responses=(setupState.responses||[]).filter(r=>!/^test\\b/i.test(String(r.name||'').trim())),rows=[...document.querySelectorAll('#setupRows .setupRow')];
  responses.forEach((r,i)=>{const invite=inviteFor(r.id),row=rows[i],host=row?.querySelector('.setupInvite');if(!invite||!host||invite.status!=='delivery_failed')return;if(host.querySelector('[data-retry-invite]'))return;const note=document.createElement('span');note.className='small muted';note.textContent=' · Email delivery failed, but the account setup is safe.';host.appendChild(note);const btn=document.createElement('button');btn.className='btn secondary small';btn.style.marginLeft='8px';btn.dataset.retryInvite='1';btn.textContent='Retry invitation';btn.onclick=()=>window.retryInvitation(invite.id,btn);host.appendChild(btn)});
}
window.retryInvitation=async(id,btn)=>{btn.disabled=true;const old=btn.textContent;btn.textContent='Retrying…';try{const r=await fetch(\`/api/admin/invitations/\${id}/retry\`,{method:'POST'}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not retry invitation');if(d.invitation?.delivery?.sent){if(window.toast)toast(\`Activation email sent to \${d.worker?.contact_email||'worker'}\`)}else if(d.invitation?.activation_url){prompt('Email delivery is still unavailable. Copy this secure activation link and send it to the worker:',d.invitation.activation_url)}await setupLoad()}catch(e){if(window.toast)toast(e.message||'Could not retry invitation');else alert(e.message)}finally{btn.disabled=false;btn.textContent=old}};
`;
  ui=ui.replace(fnNeedle,`${recovery}\n${fnNeedle}`);
  await writeFile(uiPath,ui);
}

// Safe startup diagnostic: log only domain names/statuses, never API keys or message content.
const apiKey=process.env.RESEND_API_KEY||'';
if(apiKey){
  try{
    const r=await fetch('https://api.resend.com/domains?limit=100',{headers:{authorization:`Bearer ${apiKey}`,accept:'application/json'}}),d=await r.json().catch(()=>({}));
    if(r.ok){const domains=(Array.isArray(d?.data)?d.data:[]).map(x=>({name:x.name,status:x.status,sending:x?.capabilities?.sending||null}));console.log('Invite delivery domains',JSON.stringify(domains))}
    else console.log('Invite delivery domain check unavailable',r.status);
  }catch(e){console.log('Invite delivery domain check failed',String(e?.message||e).slice(0,120))}
}
