/**
 * Pure British-auction domain rules (no I/O) — easy to unit test.
 */

const TRIGGERS = ['BID_RECEIVED', 'ANY_RANK_CHANGE', 'L1_RANK_CHANGE'];

const MINUTE = 60 * 1000;

/** Auction status derived from time (no cron needed). */
function computeStatus(rfq, now = new Date()) {
  const start = new Date(rfq.bid_start_at);
  const close = new Date(rfq.current_bid_close_at);
  const forced = new Date(rfq.forced_bid_close_at);
  if (now < start) return 'UPCOMING';
  if (now < close) return 'ACTIVE';
  // Closed because extensions pushed it all the way to the forced close time.
  if (close.getTime() >= forced.getTime()) return 'FORCE_CLOSED';
  return 'CLOSED';
}

/** True if `now` falls inside the trigger window [close - X, close). */
function isInTriggerWindow(rfq, now) {
  const close = new Date(rfq.current_bid_close_at).getTime();
  const windowStart = close - rfq.trigger_window_minutes * MINUTE;
  return now.getTime() >= windowStart && now.getTime() < close;
}

/**
 * Decide whether a just-accepted bid extends the auction.
 * @param rfq     locked RFQ row (before update)
 * @param now     time the bid was accepted
 * @param before  ranking before the bid: [{supplier_id, rank}] ordered by rank
 * @param after   ranking after the bid
 * @returns {{extend:boolean, reason?:string, previousClose?:Date, newClose?:Date, capped?:boolean}}
 */
function evaluateExtension(rfq, now, before, after) {
  if (!isInTriggerWindow(rfq, now)) return { extend: false };

  let reason = null;
  switch (rfq.extension_trigger) {
    case 'BID_RECEIVED':
      reason = `Bid received within last ${rfq.trigger_window_minutes} min of close`;
      break;
    case 'ANY_RANK_CHANGE': {
      // A rank change = any supplier that was already ranked now holds a different rank.
      const afterRank = new Map(after.map((r) => [String(r.supplier_id), Number(r.rank)]));
      const changed = before.filter((r) => afterRank.get(String(r.supplier_id)) !== Number(r.rank));
      if (changed.length) {
        reason = `Supplier ranking changed within last ${rfq.trigger_window_minutes} min of close`;
      }
      break;
    }
    case 'L1_RANK_CHANGE': {
      const oldL1 = before[0] ? String(before[0].supplier_id) : null;
      const newL1 = after[0] ? String(after[0].supplier_id) : null;
      if (oldL1 !== newL1) {
        reason = `New lowest bidder (L1) within last ${rfq.trigger_window_minutes} min of close`;
      }
      break;
    }
    default:
      return { extend: false };
  }
  if (!reason) return { extend: false };

  const previousClose = new Date(rfq.current_bid_close_at);
  const forced = new Date(rfq.forced_bid_close_at);
  if (previousClose.getTime() >= forced.getTime()) return { extend: false }; // already at cap

  const proposed = new Date(previousClose.getTime() + rfq.extension_minutes * MINUTE);
  const capped = proposed.getTime() > forced.getTime();
  const newClose = capped ? forced : proposed; // never beyond forced close
  return { extend: true, reason, previousClose, newClose, capped };
}

// ---------- validation ----------

const isValidDate = (v) => v && !Number.isNaN(new Date(v).getTime());
const isPosInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const isMoney = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0;

function validateRfqInput(body, now = new Date()) {
  const e = {};
  if (!body.name || !String(body.name).trim()) e.name = 'RFQ name is required';
  if (!body.reference_id || !String(body.reference_id).trim()) e.reference_id = 'Reference ID is required';
  for (const f of ['bid_start_at', 'bid_close_at', 'forced_bid_close_at']) {
    if (!isValidDate(body[f])) e[f] = 'A valid date & time is required';
  }
  if (!isValidDate(body.pickup_date)) e.pickup_date = 'Pickup / service date is required';
  if (!isPosInt(body.trigger_window_minutes)) e.trigger_window_minutes = 'Trigger window (X) must be a positive whole number';
  if (!isPosInt(body.extension_minutes)) e.extension_minutes = 'Extension duration (Y) must be a positive whole number';
  if (!TRIGGERS.includes(body.extension_trigger)) e.extension_trigger = `Trigger must be one of ${TRIGGERS.join(', ')}`;

  if (!e.bid_start_at && !e.bid_close_at && new Date(body.bid_close_at) <= new Date(body.bid_start_at)) {
    e.bid_close_at = 'Bid close time must be after bid start time';
  }
  if (!e.bid_close_at && new Date(body.bid_close_at) <= now) {
    e.bid_close_at = 'Bid close time must be in the future';
  }
  if (!e.forced_bid_close_at && !e.bid_close_at && new Date(body.forced_bid_close_at) <= new Date(body.bid_close_at)) {
    e.forced_bid_close_at = 'Forced bid close time must be later than bid close time';
  }
  return e;
}

function validateBidInput(body) {
  const e = {};
  if (!body.supplier_name || !String(body.supplier_name).trim()) e.supplier_name = 'Supplier name is required';
  if (!body.carrier_name || !String(body.carrier_name).trim()) e.carrier_name = 'Carrier name is required';
  for (const f of ['freight_charges', 'origin_charges', 'destination_charges']) {
    if (!isMoney(body[f])) e[f] = 'Must be a number ≥ 0';
  }
  if (!e.freight_charges && !e.origin_charges && !e.destination_charges &&
      Number(body.freight_charges) + Number(body.origin_charges) + Number(body.destination_charges) <= 0) {
    e.freight_charges = 'Total quote must be greater than 0';
  }
  if (!isPosInt(body.transit_time_days)) e.transit_time_days = 'Transit time must be a positive whole number of days';
  if (!isValidDate(body.quote_validity_date)) {
    e.quote_validity_date = 'Quote validity date is required';
  } else if (String(body.quote_validity_date).slice(0, 10) < new Date().toISOString().slice(0, 10)) {
    e.quote_validity_date = 'Quote validity cannot be in the past';
  }
  return e;
}

module.exports = {
  TRIGGERS,
  computeStatus,
  isInTriggerWindow,
  evaluateExtension,
  validateRfqInput,
  validateBidInput,
};
