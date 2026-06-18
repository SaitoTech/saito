CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  signature TEXT NOT NULL UNIQUE,

  listing_id TEXT NOT NULL,

  nft_id TEXT DEFAULT '',

  quantity INTEGER DEFAULT 1,

  status INTEGER DEFAULT 1,
  onchain INTEGER DEFAULT 1,

  block_id INTEGER DEFAULT 0,
  block_hash TEXT DEFAULT '',
  transaction_id INTEGER DEFAULT 0,
  slip_id INTEGER DEFAULT 0,

  access_hash TEXT DEFAULT '',
  access_script TEXT DEFAULT '',

  utxo_slip1 TEXT DEFAULT '',
  utxo_slip2 TEXT DEFAULT '',
  utxo_slip3 TEXT DEFAULT '',

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);
