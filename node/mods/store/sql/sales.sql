CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  purchase_sig TEXT NOT NULL UNIQUE,

  buyer TEXT DEFAULT '',
  seller TEXT DEFAULT '',

  listing_signature TEXT DEFAULT '',

  nft_id TEXT DEFAULT '',

  quantity INTEGER DEFAULT 1,

  price TEXT DEFAULT '',
  fee TEXT DEFAULT '',

  refund TEXT DEFAULT '',

  status TEXT DEFAULT 'pending',

  created_at INTEGER DEFAULT 0

);
