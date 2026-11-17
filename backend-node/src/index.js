require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { ApiError } = require('./errors');
const service = require('./rfqService');
const { applySchema } = require('./initDb');
const { seedDemo } = require('./seed');

const app = express();
app.use(cors());
app.use(express.json());

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parseId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'Invalid RFQ id');
  return id;
};

app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', backend: 'express', server_time: new Date() });
}));

app.get('/api/rfqs', wrap(async (_req, res) => res.json(await service.listRfqs())));

app.post('/api/rfqs', wrap(async (req, res) => res.status(201).json(await service.createRfq(req.body || {}))));

app.get('/api/rfqs/:id', wrap(async (req, res) => res.json(await service.getRfqDetails(parseId(req.params.id)))));

app.post('/api/rfqs/:id/bids', wrap(async (req, res) =>
  res.status(201).json(await service.submitBid(parseId(req.params.id), req.body || {}))));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// In production the built React app (frontend/dist) is served from the same origin.
const DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details || null });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT) || 4000;
async function start() {
  if (process.env.AUTO_MIGRATE !== 'false') await applySchema();
  // SEED_DEMO=true loads demo auctions, but only into an empty database.
  if (process.env.SEED_DEMO === 'true') {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM rfqs');
    if (rows[0].n === 0) {
      await seedDemo();
      console.log('Seeded demo auctions.');
    }
  }
  app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}

module.exports = app;
