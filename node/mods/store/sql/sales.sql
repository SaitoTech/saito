CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  signature TEXT NOT NULL UNIQUE,

  listing TEXT NOT NULL,

  buyer TEXT DEFAULT '',
  seller TEXT DEFAULT '',

  quantity INTEGER DEFAULT 1,

  price TEXT DEFAULT '',
  fee TEXT DEFAULT '',

  refund TEXT DEFAULT '',

  status INTEGER DEFAULT 0,
  onchain INTEGER DEFAULT 1,

  fulfillment_tx TEXT DEFAULT '',
  retry_count INTEGER DEFAULT 0,
  last_attempt INTEGER DEFAULT 0,

  block_id INTEGER DEFAULT 0,
  block_hash TEXT DEFAULT '',
  transaction_id INTEGER DEFAULT 0,

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);
