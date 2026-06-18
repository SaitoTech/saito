CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,

  nft_id TEXT DEFAULT '',
  seller TEXT DEFAULT '',

  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  image TEXT DEFAULT NULL,

  price INTEGER DEFAULT 0,

  quantity_total INTEGER DEFAULT 1,
  quantity_available INTEGER DEFAULT 1,
  quantity_reserved INTEGER DEFAULT 0,

  status INTEGER DEFAULT 1,

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);
