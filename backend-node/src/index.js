require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { ApiError } = require('./errors');
const service = require('./rfqService');

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
if (require.main === module) {
  app.listen(port, () => console.log(`Express API listening on http://localhost:${port}`));
}

module.exports = app;
