const { Pool, types } = require('pg');

// Return DATE columns as 'YYYY-MM-DD' strings (avoid timezone shifts)
types.setTypeParser(1082, (v) => v);
// Return NUMERIC as JS numbers (amounts are NUMERIC(14,2) — safe for this range)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// Return BIGINT ids as numbers
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://rfq:rfq@localhost:5433/rfq_auction',
  max: 10,
  // Set DATABASE_SSL=true when connecting to a hosted database over its external URL.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

/** Run `fn(client)` inside a transaction. */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
