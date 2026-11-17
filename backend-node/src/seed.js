// Seeds demo auctions in every state (Upcoming / Active / Closed / Force Closed).
// Inserts directly via SQL so it can create auctions in the past.  Usage: npm run seed
require('dotenv').config();
const { pool } = require('./db');

const min = (m) => new Date(Date.now() + m * 60000);

async function rfq(c, r) {
  const { rows } = await c.query(
    `INSERT INTO rfqs (reference_id, name, bid_start_at, original_bid_close_at, current_bid_close_at, forced_bid_close_at,
                       pickup_date, trigger_window_minutes, extension_minutes, extension_trigger, extension_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [r.ref, r.name, r.start, r.close, r.current || r.close, r.forced, r.pickup, r.x, r.y, r.trigger, r.ext || 0]
  );
  const id = rows[0].id;
  await c.query(`INSERT INTO activity_logs (rfq_id, event_type, message, created_at) VALUES ($1,'RFQ_CREATED',$2,$3)`,
    [id, `RFQ ${r.ref} created (X=${r.x} min, Y=${r.y} min, trigger=${r.trigger})`, r.start]);
  return id;
}

async function bid(c, rfqId, supplier, carrier, freight, origin, dest, at) {
  const { rows } = await c.query(
    `INSERT INTO suppliers (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [supplier]);
  const { rows: b } = await c.query(
    `INSERT INTO bids (rfq_id, supplier_id, carrier_name, freight_charges, origin_charges, destination_charges,
                       transit_time_days, quote_validity_date, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING total_amount`,
    [rfqId, rows[0].id, carrier, freight, origin, dest, 3 + Math.floor(Math.random() * 4), '2027-01-31', at]);
  await c.query(`INSERT INTO activity_logs (rfq_id, event_type, message, metadata, created_at) VALUES ($1,'BID_SUBMITTED',$2,$3,$4)`,
    [rfqId, `${supplier} (${carrier}) bid ${Number(b[0].total_amount).toFixed(2)}`,
      { supplier, carrier, total_amount: Number(b[0].total_amount) }, at]);
}

async function extension(c, rfqId, reason, prev, next, capped, at) {
  await c.query(`INSERT INTO activity_logs (rfq_id, event_type, message, metadata, created_at) VALUES ($1,'TIME_EXTENDED',$2,$3,$4)`,
    [rfqId, `Auction extended: ${reason}.${capped ? ' Extension capped at forced close time.' : ''}`,
      { reason, previous_close_at: prev, new_close_at: next, capped_at_forced_close: capped }, at]);
}

/** Replaces all data with the 5 demo auctions. */
async function seedDemo() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('TRUNCATE activity_logs, bids, rfqs, suppliers RESTART IDENTITY CASCADE');

    // 1. Active, closes in 8 min with a 10-min window, so new bids extend it right away
    const a = await rfq(c, { ref: 'RFQ-DEMO-01', name: 'Mumbai → Delhi FTL (20T)', start: min(-60), close: min(8),
      forced: min(30), pickup: '2026-12-05', x: 10, y: 5, trigger: 'BID_RECEIVED' });
    await bid(c, a, 'Acme Freight', 'BlueDart', 42000, 2500, 1800, min(-50));
    await bid(c, a, 'Swift Movers', 'Gati', 41000, 2200, 2000, min(-40));
    await bid(c, a, 'Acme Freight', 'BlueDart', 40000, 2500, 1800, min(-20));

    // 2. Active, long-running, L1 trigger
    const b = await rfq(c, { ref: 'RFQ-DEMO-02', name: 'Chennai Port → Bengaluru (40ft container)', start: min(-30),
      close: min(120), forced: min(180), pickup: '2026-12-10', x: 15, y: 10, trigger: 'L1_RANK_CHANGE' });
    await bid(c, b, 'Coastal Carriers', 'TCI', 65000, 4000, 3000, min(-25));

    // 3. Upcoming
    await rfq(c, { ref: 'RFQ-DEMO-03', name: 'Pune → Hyderabad LTL', start: min(30), close: min(150), forced: min(200),
      pickup: '2026-12-15', x: 10, y: 5, trigger: 'ANY_RANK_CHANGE' });

    // 4. Closed normally (one extension)
    const d = await rfq(c, { ref: 'RFQ-DEMO-04', name: 'Kolkata → Guwahati Reefer', start: min(-300), close: min(-125),
      current: min(-120), forced: min(-60), pickup: '2026-11-25', x: 10, y: 5, trigger: 'BID_RECEIVED', ext: 1 });
    await bid(c, d, 'Swift Movers', 'Gati', 88000, 3000, 2500, min(-200));
    await bid(c, d, 'Eastern Logistics', 'Safexpress', 85000, 3500, 2500, min(-128));
    await extension(c, d, 'Bid received within last 10 min of close', min(-125), min(-120), false, min(-128));

    // 5. Force closed (extensions hit the forced close time)
    const e = await rfq(c, { ref: 'RFQ-DEMO-05', name: 'Delhi → Jaipur Express', start: min(-240), close: min(-100),
      current: min(-90), forced: min(-90), pickup: '2026-11-22', x: 10, y: 5, trigger: 'L1_RANK_CHANGE', ext: 2 });
    await bid(c, e, 'Acme Freight', 'BlueDart', 30000, 1000, 900, min(-150));
    await bid(c, e, 'Swift Movers', 'Gati', 29000, 1000, 800, min(-103));
    await extension(c, e, 'New lowest bidder (L1) within last 10 min of close', min(-100), min(-95), false, min(-103));
    await bid(c, e, 'Acme Freight', 'BlueDart', 28000, 1000, 800, min(-97));
    await extension(c, e, 'New lowest bidder (L1) within last 10 min of close', min(-95), min(-90), true, min(-97));

    await c.query('COMMIT');
    console.log('Seeded 5 demo auctions.');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

module.exports = { seedDemo };

if (require.main === module) {
  seedDemo()
    .then(() => pool.end())
    .catch((e) => { console.error(e); process.exit(1); });
}
