const { pool, withTransaction } = require('./db');
const { ApiError } = require('./errors');
const {
  computeStatus,
  evaluateExtension,
  validateRfqInput,
  validateBidInput,
} = require('./auction');

const withStatus = (rfq, now = new Date()) => ({ ...rfq, status: computeStatus(rfq, now) });

async function getRankings(client, rfqId) {
  const { rows } = await client.query(
    `SELECT r.id AS bid_id, r.supplier_id, r.supplier_name, r.carrier_name,
            r.freight_charges, r.origin_charges, r.destination_charges, r.total_amount,
            r.transit_time_days, r.quote_validity_date, r.created_at, r.rank,
            (SELECT COUNT(*)::int FROM bids b WHERE b.rfq_id = r.rfq_id AND b.supplier_id = r.supplier_id) AS revisions
       FROM rfq_live_rankings r
      WHERE r.rfq_id = $1
      ORDER BY r.rank`,
    [rfqId]
  );
  return rows.map((r) => ({ ...r, rank: Number(r.rank), rank_label: `L${r.rank}` }));
}

async function listRfqs() {
  const { rows } = await pool.query(
    `SELECT q.*,
            (SELECT MIN(total_amount) FROM rfq_live_rankings r WHERE r.rfq_id = q.id) AS lowest_bid,
            (SELECT supplier_name FROM rfq_live_rankings r WHERE r.rfq_id = q.id AND r.rank = 1) AS l1_supplier,
            (SELECT COUNT(*)::int FROM bids b WHERE b.rfq_id = q.id) AS bid_count,
            (SELECT COUNT(DISTINCT supplier_id)::int FROM bids b WHERE b.rfq_id = q.id) AS supplier_count
       FROM rfqs q
      WHERE q.is_british_auction
      ORDER BY q.created_at DESC`
  );
  const now = new Date();
  return { server_time: now, items: rows.map((r) => withStatus(r, now)) };
}

async function getRfqDetails(id, client = pool) {
  const { rows } = await client.query('SELECT * FROM rfqs WHERE id = $1', [id]);
  if (!rows.length) throw new ApiError(404, 'RFQ not found');
  const [rankings, bids, activity] = await Promise.all([
    getRankings(client, id),
    client.query(
      `SELECT b.*, s.name AS supplier_name FROM bids b JOIN suppliers s ON s.id = b.supplier_id
        WHERE b.rfq_id = $1 ORDER BY b.created_at DESC, b.id DESC`,
      [id]
    ),
    client.query('SELECT * FROM activity_logs WHERE rfq_id = $1 ORDER BY created_at DESC, id DESC', [id]),
  ]);
  const now = new Date();
  return {
    server_time: now,
    ...withStatus(rows[0], now),
    lowest_bid: rankings[0]?.total_amount ?? null,
    rankings,
    bids: bids.rows,
    activity: activity.rows,
  };
}

async function createRfq(body) {
  const errors = validateRfqInput(body);
  if (Object.keys(errors).length) throw new ApiError(400, 'Validation failed', errors);

  return withTransaction(async (client) => {
    let rfq;
    try {
      const { rows } = await client.query(
        `INSERT INTO rfqs (reference_id, name, bid_start_at, original_bid_close_at, current_bid_close_at,
                           forced_bid_close_at, pickup_date, trigger_window_minutes, extension_minutes, extension_trigger)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          String(body.reference_id).trim(),
          String(body.name).trim(),
          new Date(body.bid_start_at),
          new Date(body.bid_close_at),
          new Date(body.forced_bid_close_at),
          String(body.pickup_date).slice(0, 10),
          Number(body.trigger_window_minutes),
          Number(body.extension_minutes),
          body.extension_trigger,
        ]
      );
      rfq = rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new ApiError(409, 'Validation failed', { reference_id: 'Reference ID already exists' });
      }
      throw err;
    }
    await client.query(
      `INSERT INTO activity_logs (rfq_id, event_type, message, metadata) VALUES ($1,'RFQ_CREATED',$2,$3)`,
      [
        rfq.id,
        `RFQ ${rfq.reference_id} created (X=${rfq.trigger_window_minutes} min, Y=${rfq.extension_minutes} min, trigger=${rfq.extension_trigger})`,
        { bid_close_at: rfq.current_bid_close_at, forced_bid_close_at: rfq.forced_bid_close_at },
      ]
    );
    return withStatus(rfq);
  });
}

/**
 * Submit a bid. The RFQ row is locked (SELECT ... FOR UPDATE) so concurrent bids are
 * serialised: ranking comparison and extension are evaluated atomically.
 */
async function submitBid(rfqId, body) {
  const errors = validateBidInput(body);
  if (Object.keys(errors).length) throw new ApiError(400, 'Validation failed', errors);

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM rfqs WHERE id = $1 FOR UPDATE', [rfqId]);
    if (!rows.length) throw new ApiError(404, 'RFQ not found');
    const rfq = rows[0];

    const now = new Date(); // taken after acquiring the lock
    const status = computeStatus(rfq, now);
    if (status === 'UPCOMING') throw new ApiError(409, 'Bidding has not started yet');
    if (status !== 'ACTIVE') throw new ApiError(409, 'Auction is closed — bids are no longer accepted');

    const { rows: sup } = await client.query(
      `INSERT INTO suppliers (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name`,
      [String(body.supplier_name).trim()]
    );
    const supplier = sup[0];

    const before = await getRankings(client, rfq.id);
    const total = Number(body.freight_charges) + Number(body.origin_charges) + Number(body.destination_charges);

    // British auction: a supplier can only improve (lower) their own price.
    const own = before.find((r) => r.supplier_id === supplier.id);
    if (own && total >= own.total_amount) {
      throw new ApiError(400, 'Validation failed', {
        freight_charges: `New total (${total.toFixed(2)}) must be lower than your current bid (${own.total_amount.toFixed(2)})`,
      });
    }

    const { rows: bidRows } = await client.query(
      `INSERT INTO bids (rfq_id, supplier_id, carrier_name, freight_charges, origin_charges,
                         destination_charges, transit_time_days, quote_validity_date, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        rfq.id,
        supplier.id,
        String(body.carrier_name).trim(),
        Number(body.freight_charges),
        Number(body.origin_charges),
        Number(body.destination_charges),
        Number(body.transit_time_days),
        String(body.quote_validity_date).slice(0, 10),
        now,
      ]
    );
    const bid = bidRows[0];
    const after = await getRankings(client, rfq.id);
    const myRank = after.find((r) => r.supplier_id === supplier.id);

    await client.query(
      `INSERT INTO activity_logs (rfq_id, event_type, message, metadata, created_at) VALUES ($1,'BID_SUBMITTED',$2,$3,$4)`,
      [
        rfq.id,
        `${supplier.name} (${bid.carrier_name}) bid ${bid.total_amount.toFixed(2)} → ranked ${myRank.rank_label}`,
        { bid_id: bid.id, supplier: supplier.name, total_amount: bid.total_amount, rank: myRank.rank_label },
        now,
      ]
    );

    const ext = evaluateExtension(rfq, now, before, after);
    if (ext.extend) {
      await client.query(
        `UPDATE rfqs SET current_bid_close_at = $2, extension_count = extension_count + 1, updated_at = now()
          WHERE id = $1`,
        [rfq.id, ext.newClose]
      );
      await client.query(
        `INSERT INTO activity_logs (rfq_id, event_type, message, metadata, created_at) VALUES ($1,'TIME_EXTENDED',$2,$3,$4)`,
        [
          rfq.id,
          `Auction extended: ${ext.reason}.` +
            (ext.capped ? ' Extension capped at forced close time.' : ` +${rfq.extension_minutes} min.`),
          {
            reason: ext.reason,
            trigger: rfq.extension_trigger,
            previous_close_at: ext.previousClose,
            new_close_at: ext.newClose,
            capped_at_forced_close: ext.capped,
          },
          now,
        ]
      );
    }

    return {
      bid: { ...bid, supplier_name: supplier.name, rank: myRank.rank, rank_label: myRank.rank_label },
      extension: ext.extend
        ? { reason: ext.reason, previous_close_at: ext.previousClose, new_close_at: ext.newClose, capped: ext.capped }
        : null,
    };
  });

  return { ...result, rfq: await getRfqDetails(rfqId) };
}

module.exports = { listRfqs, getRfqDetails, createRfq, submitBid };
