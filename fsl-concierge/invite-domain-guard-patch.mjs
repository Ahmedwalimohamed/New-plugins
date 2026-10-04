import { readFile, writeFile } from 'node:fs/promises';

const routesPath='universal-multiuser-routes.txt';
let routes=await readFile(routesPath,'utf8');

const loose="const canSend=x=>Boolean(x?.name)&&((x.status==='verified')||(x?.capabilities?.sending==='enabled'))&&x?.capabilities?.sending!=='disabled';";
const strict="const canSend=x=>Boolean(x?.name)&&(['verified','partially_verified'].includes(String(x.status||'')))&&x?.capabilities?.sending==='enabled';";
if(routes.includes(loose))routes=routes.replace(loose,strict);

const oldFallback="return{from:raw,source:'configured_unverified',domain:configuredDomain||null};";
const newFallback="return{from:raw,source:'no_verified_domain',domain:configuredDomain||null};";
if(routes.includes(oldFallback))routes=routes.replace(oldFallback,newFallback);

const senderLine="const sender=await conciergeResolveInviteSender(apiKey,configuredFrom),from=sender.from;";
const guardedSender="const sender=await conciergeResolveInviteSender(apiKey,configuredFrom),from=sender.from;if(sender.source==='no_verified_domain')return{sent:false,provider:'not_configured',error:'No verified Resend sending domain is available. Use the secure activation link until a sender domain is verified.',sender_domain:sender.domain,sender_source:sender.source};";
if(routes.includes(senderLine))routes=routes.replace(senderLine,guardedSender);

await writeFile(routesPath,routes);

const uiPath='ui/admin-setup-engine.html';
let ui=await readFile(uiPath,'utf8');
ui=ui.replace("invite.status!=='delivery_failed'","!['delivery_failed','pending'].includes(invite.status)");
ui=ui.replace("Email delivery failed, but the account setup is safe.","Email delivery is unavailable, but the account setup and secure activation flow are safe.");
await writeFile(uiPath,ui);
