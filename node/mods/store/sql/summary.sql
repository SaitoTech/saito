CREATE TABLE IF NOT EXISTS summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  nft_id TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'Other',

  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  image TEXT DEFAULT NULL,

  quantity_available INTEGER DEFAULT 0,

  updated_at INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS summary_nft_price_uidx
  ON summary (nft_id, price);
