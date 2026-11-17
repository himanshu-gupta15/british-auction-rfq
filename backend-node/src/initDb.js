// Applies ../db/schema.sql (idempotent). Used on server start and via `npm run db:init`.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const SCHEMA = path.join(__dirname, '..', '..', 'db', 'schema.sql');

async function applySchema() {
  await pool.query(fs.readFileSync(SCHEMA, 'utf8'));
}

module.exports = { applySchema };

if (require.main === module) {
  applySchema()
    .then(() => { console.log('Schema applied.'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
