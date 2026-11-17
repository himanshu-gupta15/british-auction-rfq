const test = require('node:test');
const assert = require('node:assert');
const { computeStatus, evaluateExtension, validateRfqInput } = require('../src/auction');

const at = (hhmm) => new Date(`2030-01-01T${hhmm}:00Z`);
const baseRfq = (trigger) => ({
  bid_start_at: at('17:00'),
  current_bid_close_at: at('18:00'),
  forced_bid_close_at: at('18:12'),
  trigger_window_minutes: 10,
  extension_minutes: 5,
  extension_trigger: trigger,
});
const r = (...ids) => ids.map((id, i) => ({ supplier_id: id, rank: i + 1 }));

test('BID_RECEIVED extends when bid inside window (spec 6.3a: 5:55 PM)', () => {
  const res = evaluateExtension(baseRfq('BID_RECEIVED'), at('17:55'), r('A'), r('A', 'B'));
  assert.equal(res.extend, true);
  assert.deepEqual(res.newClose, at('18:05'));
});

test('no extension outside trigger window', () => {
  const res = evaluateExtension(baseRfq('BID_RECEIVED'), at('17:45'), r(), r('A'));
  assert.equal(res.extend, false);
});

test('ANY_RANK_CHANGE: underbid changes ranks (spec 6.3b)', () => {
  const res = evaluateExtension(baseRfq('ANY_RANK_CHANGE'), at('17:58'), r('A', 'B'), r('B', 'A'));
  assert.equal(res.extend, true);
});

test('ANY_RANK_CHANGE: new supplier entering last does not change existing ranks', () => {
  const res = evaluateExtension(baseRfq('ANY_RANK_CHANGE'), at('17:58'), r('A', 'B'), r('A', 'B', 'C'));
  assert.equal(res.extend, false);
});

test('L1_RANK_CHANGE: only when lowest bidder changes (spec 6.3c)', () => {
  const rfq = baseRfq('L1_RANK_CHANGE');
  assert.equal(evaluateExtension(rfq, at('17:59'), r('A', 'B', 'C'), r('A', 'C', 'B')).extend, false);
  assert.equal(evaluateExtension(rfq, at('17:59'), r('A', 'B', 'C'), r('C', 'A', 'B')).extend, true);
});

test('extension is capped at forced close time', () => {
  const rfq = { ...baseRfq('BID_RECEIVED'), current_bid_close_at: at('18:10') };
  const res = evaluateExtension(rfq, at('18:08'), r('A'), r('A'));
  assert.equal(res.extend, true);
  assert.equal(res.capped, true);
  assert.deepEqual(res.newClose, at('18:12'));
});

test('no extension once close already equals forced close', () => {
  const rfq = { ...baseRfq('BID_RECEIVED'), current_bid_close_at: at('18:12') };
  assert.equal(evaluateExtension(rfq, at('18:11'), r('A'), r('A')).extend, false);
});

test('status: active / closed / force closed', () => {
  const rfq = baseRfq('BID_RECEIVED');
  assert.equal(computeStatus(rfq, at('16:00')), 'UPCOMING');
  assert.equal(computeStatus(rfq, at('17:30')), 'ACTIVE');
  assert.equal(computeStatus(rfq, at('18:01')), 'CLOSED');
  assert.equal(computeStatus({ ...rfq, current_bid_close_at: at('18:12') }, at('18:13')), 'FORCE_CLOSED');
});

test('validation: forced close must be after bid close', () => {
  const e = validateRfqInput({
    name: 'x', reference_id: 'y', bid_start_at: at('17:00'), bid_close_at: at('18:00'),
    forced_bid_close_at: at('18:00'), pickup_date: '2030-01-05',
    trigger_window_minutes: 10, extension_minutes: 5, extension_trigger: 'BID_RECEIVED',
  }, at('16:00'));
  assert.ok(e.forced_bid_close_at);
});
