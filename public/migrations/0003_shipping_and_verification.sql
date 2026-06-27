-- Phase 0: Logistics shipping info
CREATE TABLE IF NOT EXISTS shipping (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL UNIQUE,
  carrier TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  shipped_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);

CREATE INDEX IF NOT EXISTS idx_shipping_deal ON shipping(deal_id);

-- Phase 1: AI verification results
CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK(check_type IN ('pre_shipment','post_receipt')),
  provider TEXT NOT NULL DEFAULT 'cloudflare',
  result_json TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL DEFAULT 'pending' CHECK(verdict IN ('pass','warn','fail','pending','error')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);

CREATE INDEX IF NOT EXISTS idx_verifications_deal ON verifications(deal_id);
