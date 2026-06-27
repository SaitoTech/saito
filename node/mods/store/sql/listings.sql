CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  nft_id TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,

  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  image TEXT DEFAULT NULL,

  quantity_available INTEGER DEFAULT 0,
  quantity_pending INTEGER DEFAULT 0,
  quantity_sold INTEGER DEFAULT 0,

  updated_at INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS listings_nft_price_uidx
  ON listings (nft_id, price);
