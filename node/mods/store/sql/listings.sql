CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  signature TEXT NOT NULL UNIQUE,

  nft_id TEXT DEFAULT '',
  seller TEXT DEFAULT '',

  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  image TEXT DEFAULT NULL,

  price TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,

  status INTEGER DEFAULT 1,
  onchain INTEGER DEFAULT 1,

  block_id INTEGER DEFAULT 0,
  block_hash TEXT DEFAULT '',
  transaction_id INTEGER DEFAULT 0,
  slip_id INTEGER DEFAULT 0,

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);
