CREATE TABLE IF NOT EXISTS store_featured (
  store_key TEXT NOT NULL,
  nft_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (store_key, nft_id)
);
