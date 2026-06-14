CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  nfttx_sig TEXT NOT NULL UNIQUE,
  nft_id TEXT DEFAULT '',

  seller TEXT DEFAULT '',

  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  reserve_price INTEGER DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  status INTEGER DEFAULT 1,

  created_at INTEGER DEFAULT 0,
  spent_at INTEGER DEFAULT 0

);

