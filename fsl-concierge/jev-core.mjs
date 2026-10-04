// Shared Jev (TypeSafe System One) helpers: redaction, sanitising, question sets, routing.
// Pure functions only, so they can be unit tested (see test/jev-core.test.mjs).

const EMAIL_RE=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Dates/times are needed for urgency and deadline judgements, so they are shielded from the phone/ID rules.
const DATE_RE=/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b|\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/g;
const CUR='(?:USD|US\\$|EUR|GBP|SOS|SLSH|SLS|KES|ETB|AED)';
const NUM='\\d(?:[\\d,]|\\s(?=\\d))*(?:\\.\\d+)?';
const AMOUNT_RE=new RegExp(`(?<![A-Za-z0-9])(?:${CUR}|[$\u20ac\u00a3])\\s?${NUM}|(?<![A-Za-z0-9.,])${NUM}\\s?(?:${CUR}|dollars?|shillings?)\\b`,'gi');
const PHONE_RE=/\+?\d[\d\s().-]{7,}\d/g;
const LONG_ID_RE=/\b\d{7,}\b/g;

export function redactSensitiveText(v,max=14000){
  const shielded=[];
  let s=String(v??'').replace(EMAIL_RE,'[EMAIL]').replace(DATE_RE,m=>`\u27e6D${shielded.push(m)-1}\u27e7`);
  s=s.replace(AMOUNT_RE,'[AMOUNT]').replace(PHONE_RE,'[PHONE_OR_ID]').replace(LONG_ID_RE,'[ID]');
  return s.replace(/\u27e6D(\d+)\u27e7/g,(_,i)=>shielded[Number(i)]).slice(0,max);
}
export function jevRedactText(v){return redactSensitiveText(v,14000)}

// Key-order-independent JSON, used to tie a human override to the exact content Jev reviewed.
export function stableStringify(v){
  if(Array.isArray(v))return `[${v.map(stableStringify).join(',')}]`;
  if(v&&typeof v==='object')return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v??null);
}

export function jevSanitizeObject(obj){const out={};for(const [k,v] of Object.entries(obj||{})){if(v==null||typeof v==='boolean'||typeof v==='number')out[k]=v;else if(typeof v==='string')out[k]=jevRedactText(v);else if(Array.isArray(v))out[k]=v.slice(0,20).map(x=>typeof x==='string'?jevRedactText(x):x&&typeof x==='object'?jevSanitizeObject(x):x);else if(typeof v==='object')out[k]=jevSanitizeObject(v)}return out}
export function jevCertainty(a){if(!a)return 0;if(typeof a.confidence==='number')return Math.max(0,Math.min(1,a.confidence));if(typeof a.noul==='number')return Math.max(0,Math.min(1,Math.abs(a.noul-.5)*2));return 0}
export function jevQuestions(entityType,stage){
  if(entityType==='work_product')return{
    request_alignment:{type:'choice',instructions:'Does this work product actually answer the underlying work request?',criteria:{MATCH:'Directly answers the request and stays within scope',PARTIAL_MATCH:'Addresses the request but misses or drifts on material parts',MISMATCH:'Does not answer the requested work'}},
    evidence_alignment:{type:'choice',instructions:'How well are factual claims supported by the supplied evidence summary?',criteria:{SUPPORTED:'Material factual claims are supported',PARTIALLY_SUPPORTED:'Some material claims lack support or rely on weak evidence',UNSUPPORTED:'Material claims are not supported',NO_EVIDENCE:'There is not enough evidence to judge support'}},
    possible_claim_conflict:{type:'noul',instructions:'Is there a likely material conflict between the work product and the evidence or request?'},
    possible_overstatement:{type:'noul',instructions:'Does the work product likely overstate certainty, completion, approval, results, beneficiary figures, budgets, or facts?'},
    sensitive_information:{type:'choice',instructions:'What is the highest sensitivity category materially present?',criteria:{none:'No sensitive or consequential information',beneficiary_personal:'Beneficiary or personally identifying information',financial:'Budgets, payments, banking, procurement or financial approval',protection:'Protection, safeguarding or security-sensitive information',medical:'Medical or health information',credentials:'Passwords, tokens, credentials or access secrets',other_sensitive:'Other sensitive information requiring restricted handling'}},
    clarification_needed:{type:'noul',instructions:'Is clarification or missing information needed before this work product can be relied on?'},
    human_review_needed:{type:'noul',instructions:'Does this require an authorized human to review before it is used, sent, approved, or treated as final?'},
    issue_severity:{type:'score',instructions:'Rate the severity of any issue in this work product.',criteria:['No material issue','Minor issue; safe after quick check','Material issue requiring review or correction','Critical or consequential issue; do not proceed without authorized review']}
  };
  if(entityType==='assignment')return{
    instructions_clear:{type:'noul',instructions:'Are the assignment instructions clear enough for the assignee to know what to do?'},
    completion_criteria_clear:{type:'noul',instructions:'Is it clear what evidence or deliverable would count as completed?'},
    deadline_risk:{type:'score',instructions:'Rate deadline or follow-up risk from the assignment state.',criteria:['Low risk','Some risk; monitor normally','High risk; follow up soon','Critical/overdue/blocking risk; escalate']},
    sensitive_information:{type:'choice',instructions:'What is the highest sensitivity category materially present?',criteria:{none:'No sensitive or consequential information',beneficiary_personal:'Beneficiary or personally identifying information',financial:'Budgets, payments, banking, procurement or financial approval',protection:'Protection, safeguarding or security-sensitive information',medical:'Medical or health information',credentials:'Passwords, tokens, credentials or access secrets',other_sensitive:'Other sensitive information requiring restricted handling'}},
    financial_or_beneficiary_decision:{type:'noul',instructions:'Would completing this assignment involve a financial approval, beneficiary selection/eligibility decision, or another consequential authorization?'},
    human_approval_needed:{type:'noul',instructions:'Does an authorized human need to approve the result before the assignment can be treated as complete?'},
    evidence_requirement_clear:{type:'noul',instructions:'Is the required evidence or source material sufficiently clear?'},
    issue_severity:{type:'score',instructions:'Rate the severity of any issue in this assignment.',criteria:['No material issue','Minor issue; safe with normal monitoring','Material issue requiring review or clarification','Critical or consequential issue; escalate']}
  };
  return{
    requires_action:{type:'noul',instructions:'Does this work item require the staff member or their delegate to take an action rather than only monitor it?'},
    action_type:{type:'choice',instructions:'What is the best next work type?',criteria:{no_action:'Monitor only; no response or deliverable needed',draft_response:'Draft a reply or acknowledgement',generate_report:'Prepare a report, proposal, narrative, assessment or substantive deliverable',review_document:'Review or comment on a document',prepare_brief:'Prepare meeting or briefing material',update_tracker:'Update a tracker, spreadsheet or operational record',summarize_thread:'Summarize a thread or information set',clarify:'Ask for missing information or clarification',follow_up:'Follow up on a pending dependency',delegate_candidate:'Work is suitable to assign to another staff member'}},
    urgency:{type:'score',instructions:'How urgently does this item need attention?',criteria:['Can wait','Needs attention this week','Needs attention within 1-2 days','Needs attention today or is overdue/critical']},
    clarification_needed:{type:'noul',instructions:'Is material information missing or ambiguous such that clarification is needed before safe execution?'},
    sensitive_information:{type:'choice',instructions:'What is the highest sensitivity category materially present?',criteria:{none:'No sensitive or consequential information',beneficiary_personal:'Beneficiary or personally identifying information',financial:'Budgets, payments, banking, procurement or financial approval',protection:'Protection, safeguarding or security-sensitive information',medical:'Medical or health information',credentials:'Passwords, tokens, credentials or access secrets',other_sensitive:'Other sensitive information requiring restricted handling'}},
    human_approval_needed:{type:'noul',instructions:'Does an authorized human need to approve the resulting action or decision before it is final?'},
    evidence_sufficiency:{type:'choice',instructions:'Is the available evidence sufficient to execute the requested work safely?',criteria:{sufficient:'Enough evidence for the next step',partial:'Some evidence exists but important support is missing',insufficient:'Not enough evidence to execute safely'}},
    possible_conflict:{type:'noul',instructions:'Is there a likely contradiction, duplicate, or material conflict in the available state that should be reviewed?'}
  };
}
export function jevDeriveRoute(entityType,answers){
  const vals=Object.values(answers||{}),confidence=vals.length?vals.map(jevCertainty).reduce((a,b)=>a+b,0)/vals.length:0,reasons=[];
  let route=confidence>=.90?'green':confidence>=.70?'amber':'red';
  const sensitive=answers?.sensitive_information?.choice;
  if(sensitive&&sensitive!=='none'){route='red';reasons.push(`sensitive:${sensitive}`)}
  const severity=Number(answers?.issue_severity?.score??answers?.urgency?.score??0);
  if(severity>=2.5){route='red';reasons.push('high_severity')}else if(severity>=1.5&&route==='green'){route='amber';reasons.push('elevated_risk')}
  if((answers?.clarification_needed?.noul??0)>=.85){route='red';reasons.push('clarification_needed')}else if((answers?.clarification_needed?.noul??0)>=.60&&route==='green'){route='amber';reasons.push('possible_clarification')}
  if((answers?.possible_conflict?.noul??answers?.possible_claim_conflict?.noul??0)>=.70){route='red';reasons.push('possible_conflict')}
  if((answers?.possible_overstatement?.noul??0)>=.70){route='red';reasons.push('possible_overstatement')}
  if((answers?.financial_or_beneficiary_decision?.noul??0)>=.50){route='red';reasons.push('consequential_decision')}
  if(entityType==='work_product'){
    const align=answers?.request_alignment?.choice,evidence=answers?.evidence_alignment?.choice;
    if(align==='MISMATCH'){route='red';reasons.push('request_mismatch')}else if(align==='PARTIAL_MATCH'&&route==='green'){route='amber';reasons.push('partial_request_match')}
    if(['UNSUPPORTED','NO_EVIDENCE'].includes(evidence)){route='red';reasons.push('evidence_not_sufficient')}else if(evidence==='PARTIALLY_SUPPORTED'&&route==='green'){route='amber';reasons.push('partial_evidence')}
  }
  if(entityType==='assignment'){
    if((answers?.instructions_clear?.noul??1)<.65){route=route==='red'?'red':'amber';reasons.push('instructions_unclear')}
    if((answers?.completion_criteria_clear?.noul??1)<.65){route=route==='red'?'red':'amber';reasons.push('completion_criteria_unclear')}
  }
  return{route,confidence:Number(confidence.toFixed(4)),gate_reasons:[...new Set(reasons)],requires_human_review:route!=='green'||(answers?.human_review_needed?.noul??answers?.human_approval_needed?.noul??0)>=.50};
}

// Why a "Do the work" result must wait for a human. Empty array = safe to auto-complete.
export function conciergeHoldReasons({missing=[],qaRoute,aiUsed,productType}={}){
  const reasons=[];
  if((missing||[]).length)reasons.push('missing_information');
  if(qaRoute!=='green')reasons.push(`jev_${qaRoute||'unavailable'}`);
  if(!aiUsed)reasons.push('fallback_draft');
  if(productType==='email')reasons.push('email_requires_approval');
  return reasons;
}

// A red pre-send decision can be overridden by a human, but only for the exact content that was reviewed.
export function findMatchingOverride(overrides,currentState){
  const current=stableStringify(currentState);
  return (overrides||[]).find(d=>d&&d.sanitized_state!=null&&stableStringify(d.sanitized_state)===current)||null;
}
