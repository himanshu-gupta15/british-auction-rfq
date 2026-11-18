-- British Auction RFQ System - PostgreSQL schema
-- Applied automatically by the Express backend on startup.

DO $$ BEGIN
  CREATE TYPE extension_trigger AS ENUM ('BID_RECEIVED', 'ANY_RANK_CHANGE', 'L1_RANK_CHANGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM ('RFQ_CREATED', 'BID_SUBMITTED', 'TIME_EXTENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per RFQ. British-auction config lives on the RFQ (1:1, always enabled here).
CREATE TABLE IF NOT EXISTS rfqs (
  id                       BIGSERIAL PRIMARY KEY,
  reference_id             VARCHAR(50)  NOT NULL UNIQUE,
  name                     VARCHAR(200) NOT NULL,
  bid_start_at             TIMESTAMPTZ  NOT NULL,
  original_bid_close_at    TIMESTAMPTZ  NOT NULL,           -- close time as created
  current_bid_close_at     TIMESTAMPTZ  NOT NULL,           -- moves forward on extensions
  forced_bid_close_at      TIMESTAMPTZ  NOT NULL,           -- hard stop, never exceeded
  pickup_date              DATE         NOT NULL,
  is_british_auction       BOOLEAN      NOT NULL DEFAULT TRUE,
  trigger_window_minutes   INTEGER      NOT NULL CHECK (trigger_window_minutes > 0),  -- X
  extension_minutes        INTEGER      NOT NULL CHECK (extension_minutes > 0),       -- Y
  extension_trigger        extension_trigger NOT NULL,
  extension_count          INTEGER      NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chk_close_after_start   CHECK (original_bid_close_at > bid_start_at),
  CONSTRAINT chk_forced_after_close  CHECK (forced_bid_close_at > original_bid_close_at),
  CONSTRAINT chk_current_within_forced CHECK (current_bid_close_at <= forced_bid_close_at
                                              AND current_bid_close_at >= original_bid_close_at)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Every quote submission is kept (immutable history). A supplier's *latest* bid is their live bid.
CREATE TABLE IF NOT EXISTS bids (
  id                   BIGSERIAL PRIMARY KEY,
  rfq_id               BIGINT        NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id          BIGINT        NOT NULL REFERENCES suppliers(id),
  carrier_name         VARCHAR(200)  NOT NULL,
  freight_charges      NUMERIC(14,2) NOT NULL CHECK (freight_charges >= 0),
  origin_charges       NUMERIC(14,2) NOT NULL CHECK (origin_charges >= 0),
  destination_charges  NUMERIC(14,2) NOT NULL CHECK (destination_charges >= 0),
  total_amount         NUMERIC(14,2) GENERATED ALWAYS AS
                         (freight_charges + origin_charges + destination_charges) STORED,
  transit_time_days    INTEGER       NOT NULL CHECK (transit_time_days > 0),
  quote_validity_date  DATE          NOT NULL,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bids_rfq_supplier_time ON bids (rfq_id, supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bids_rfq_total ON bids (rfq_id, total_amount);

-- Audit / activity log: bid submissions, extensions (with reason), etc.
CREATE TABLE IF NOT EXISTS activity_logs (
  id           BIGSERIAL PRIMARY KEY,
  rfq_id       BIGINT        NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  event_type   activity_type NOT NULL,
  message      TEXT          NOT NULL,
  metadata     JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_rfq_time ON activity_logs (rfq_id, created_at DESC);

-- Live ranking view: latest bid per supplier, ranked by total (ties -> earlier bid wins).
CREATE OR REPLACE VIEW rfq_live_rankings AS
SELECT lb.*,
       ROW_NUMBER() OVER (PARTITION BY lb.rfq_id ORDER BY lb.total_amount ASC, lb.created_at ASC) AS rank
FROM (
  SELECT DISTINCT ON (b.rfq_id, b.supplier_id) b.*, s.name AS supplier_name
  FROM bids b JOIN suppliers s ON s.id = b.supplier_id
  ORDER BY b.rfq_id, b.supplier_id, b.created_at DESC, b.id DESC
) lb;
