CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  public_code TEXT NOT NULL UNIQUE,
  seller_code TEXT NOT NULL UNIQUE,
  buyer_code TEXT NOT NULL UNIQUE,
  item TEXT NOT NULL,
  amount_usdc TEXT NOT NULL,
  method TEXT NOT NULL,
  ship_by TEXT NOT NULL,
  inspect TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  seller_contact TEXT,
  buyer_contact TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deal_events (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);

CREATE INDEX IF NOT EXISTS idx_deals_public_code ON deals(public_code);
CREATE INDEX IF NOT EXISTS idx_deal_events_deal_id ON deal_events(deal_id);
