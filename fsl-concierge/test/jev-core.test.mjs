import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveText, jevSanitizeObject, jevDeriveRoute, conciergeHoldReasons, findMatchingOverride, stableStringify } from '../jev-core.mjs';

test('redaction keeps dates so Jev can judge deadlines', () => {
  for (const s of ['Due 2026-10-04T09:00:00Z', 'Meeting 2026-10-04 10:00', 'Due 04/10/2026', 'Report for 12 - 15 October 2026']) {
    assert.equal(redactSensitiveText(s), s);
  }
});

test('redaction removes money in every common form', () => {
  const cases = {
    '$1,200.50 approved': '[AMOUNT] approved',
    'Budget USD 25,000 for Q4': 'Budget [AMOUNT] for Q4',
    '25,000 USD': '[AMOUNT]',
    'SLSH 500000 paid': '[AMOUNT] paid',
    'Total 1 200 000 shillings': 'Total [AMOUNT]',
    '€300 and £40': '[AMOUNT] and [AMOUNT]',
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(redactSensitiveText(input), expected, input);
});

test('redaction removes emails, phones and long IDs but keeps ordinary numbers', () => {
  assert.equal(redactSensitiveText('Reach ahmed@example.org'), 'Reach [EMAIL]');
  assert.equal(redactSensitiveText('Call +252 63 4123456'), 'Call [PHONE_OR_ID]');
  assert.equal(redactSensitiveText('ID 1234567'), 'ID [ID]');
  assert.equal(redactSensitiveText('Village 12 has 3 wells'), 'Village 12 has 3 wells');
  assert.equal(redactSensitiveText('version 2.5.1 released'), 'version 2.5.1 released');
});

test('sanitised state reaching Jev keeps due dates and hides amounts', () => {
  const out = jevSanitizeObject({ due_at: '2026-10-04T09:00:00Z', body: 'Pay $1,200.50 to x@y.org', nested: { note: 'USD 300' } });
  assert.equal(out.due_at, '2026-10-04T09:00:00Z');
  assert.equal(out.body, 'Pay [AMOUNT] to [EMAIL]');
  assert.equal(out.nested.note, '[AMOUNT]');
});

const confident = (extra = {}) => ({
  requires_action: { noul: 0.99 }, urgency: { score: 0, confidence: 0.98 },
  sensitive_information: { choice: 'none', confidence: 0.97 }, clarification_needed: { noul: 0.01 },
  evidence_sufficiency: { choice: 'sufficient', confidence: 0.95 }, ...extra,
});

test('confident, clean answers route green', () => {
  assert.equal(jevDeriveRoute('item', confident()).route, 'green');
});

test('any sensitive category forces red', () => {
  const r = jevDeriveRoute('item', confident({ sensitive_information: { choice: 'financial', confidence: 0.99 } }));
  assert.equal(r.route, 'red');
  assert.ok(r.gate_reasons.includes('sensitive:financial'));
});

test('work product that does not answer the request is red', () => {
  const r = jevDeriveRoute('work_product', { request_alignment: { choice: 'MISMATCH', confidence: 0.99 }, evidence_alignment: { choice: 'SUPPORTED', confidence: 0.99 } });
  assert.equal(r.route, 'red');
});

test('answers without a confidence value count as zero certainty (known bias, verify against live Jev)', () => {
  const r = jevDeriveRoute('item', { sensitive_information: { choice: 'none' }, evidence_sufficiency: { choice: 'sufficient' } });
  assert.equal(r.confidence, 0);
  assert.equal(r.route, 'red');
});

test('Do the work only auto-completes on green, AI draft, nothing missing, non-email', () => {
  const ok = { missing: [], qaRoute: 'green', aiUsed: true, productType: 'report' };
  assert.deepEqual(conciergeHoldReasons(ok), []);
  assert.deepEqual(conciergeHoldReasons({ ...ok, qaRoute: 'amber' }), ['jev_amber']);
  assert.deepEqual(conciergeHoldReasons({ ...ok, qaRoute: 'red' }), ['jev_red']);
  assert.deepEqual(conciergeHoldReasons({ ...ok, qaRoute: undefined }), ['jev_unavailable']);
  assert.deepEqual(conciergeHoldReasons({ ...ok, aiUsed: false }), ['fallback_draft']);
  assert.deepEqual(conciergeHoldReasons({ ...ok, missing: ['budget line'] }), ['missing_information']);
  assert.deepEqual(conciergeHoldReasons({ ...ok, productType: 'email' }), ['email_requires_approval']);
});

test('an override only applies to the exact content that was reviewed', () => {
  const reviewed = { kind: 'work_product', product: { body: 'Hello [EMAIL]', title: 'Reply' } };
  const sameDifferentKeyOrder = { product: { title: 'Reply', body: 'Hello [EMAIL]' }, kind: 'work_product' };
  const edited = { kind: 'work_product', product: { body: 'Hello [EMAIL], updated', title: 'Reply' } };
  const overrides = [{ id: 'o1', sanitized_state: reviewed }];
  assert.equal(findMatchingOverride(overrides, sameDifferentKeyOrder)?.id, 'o1');
  assert.equal(findMatchingOverride(overrides, edited), null);
  assert.equal(findMatchingOverride([], reviewed), null);
  assert.equal(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] }), stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
});
