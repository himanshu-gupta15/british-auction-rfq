# British Auction RFQ System

RFQ platform with British Auction bidding: automatic time extensions (X/Y config, 3 trigger types),
a forced close time that is never exceeded, live rankings (L1, L2, …), and an activity log.

**Stack:** React 18 (Vite) · Node.js + Express REST API · PostgreSQL

| Deliverable | Location |
|---|---|
| HLD + architecture diagram | [`docs/HLD.md`](docs/HLD.md) |
| Database schema design | [`docs/SCHEMA.md`](docs/SCHEMA.md), [`db/schema.sql`](db/schema.sql) |
| Backend code | [`backend-node/`](backend-node/) |
| Frontend code | [`frontend/`](frontend/) |

```
├── db/schema.sql              # tables, enums, constraints, ranking view
├── docs/                      # HLD.md, SCHEMA.md
├── backend-node/
│   ├── src/index.js           # Express app & routes
│   ├── src/rfqService.js      # use cases, transactions, row locking
│   ├── src/auction.js         # pure auction rules (status, extension, validation)
│   ├── src/seed.js            # demo data in every status
│   └── test/auction.test.js   # unit tests for auction rules
└── frontend/src/
    ├── pages/                 # AuctionList, CreateRfq, AuctionDetails
    └── components/            # BidForm, Countdown, StatusBadge
```

## Run locally

Prerequisites: Node.js 18+ and PostgreSQL 13+.

```bash
# 1. Database
createdb rfq_auction                 # the schema is applied automatically when the backend starts

# 2. Backend (http://localhost:4000)
cd backend-node
cp .env.example .env                 # set DATABASE_URL to your Postgres user/password
npm install
npm run seed                         # optional: 5 demo auctions (active/upcoming/closed/force-closed)
npm start

# 3. Frontend (http://localhost:5173), in a new terminal
cd frontend
npm install
npm run dev                          # /api is proxied to localhost:4000
```

Run unit tests: `cd backend-node && npm test`

## Deploy (Render)
In production a single Node service serves both the API (`/api/*`) and the built React app.
- `npm run build` (repo root) installs both packages and builds `frontend/dist`
- `npm start` starts Express. On boot it applies `db/schema.sql` (idempotent). With `SEED_DEMO=true` it also loads the demo auctions, but only when the database is empty.
- Required env: `DATABASE_URL`. Optional: `DATABASE_SSL=true` (for an external DB URL), `SEED_DEMO`, `AUTO_MIGRATE=false`.

[`render.yaml`](render.yaml) is a Blueprint that defines both the web service and the Postgres database.

## Try the extension logic
1. Create an RFQ whose bid close is a few minutes away, with X = 10 and Y = 5. You're already inside the trigger window.
2. Open it and submit quotes as different suppliers (for example "Acme Freight", then "Swift Movers" at a lower price).
3. Watch **Current bid close** move forward and the **Activity log** record each extension and its reason.
   The close time stops at the forced close time (logged as *capped*), and the auction then shows **Force Closed**.

## API
| Method | Path | |
|---|---|---|
| GET | `/api/rfqs` | Auction listing |
| POST | `/api/rfqs` | Create RFQ |
| GET | `/api/rfqs/:id` | Details: rankings, bid history, config, activity log |
| POST | `/api/rfqs/:id/bids` | Submit / lower a quote |

Example:
```bash
curl -X POST localhost:4000/api/rfqs -H 'content-type: application/json' -d '{
  "name":"Mumbai → Delhi FTL","reference_id":"RFQ-1001",
  "bid_start_at":"2026-12-01T10:00:00Z","bid_close_at":"2026-12-01T18:00:00Z",
  "forced_bid_close_at":"2026-12-01T18:30:00Z","pickup_date":"2026-12-05",
  "trigger_window_minutes":10,"extension_minutes":5,"extension_trigger":"L1_RANK_CHANGE"}'

curl -X POST localhost:4000/api/rfqs/1/bids -H 'content-type: application/json' -d '{
  "supplier_name":"Acme Freight","carrier_name":"BlueDart","freight_charges":40000,
  "origin_charges":2500,"destination_charges":1800,"transit_time_days":3,"quote_validity_date":"2026-12-31"}'
```

See [`docs/HLD.md`](docs/HLD.md) for the exact rules and design decisions.
