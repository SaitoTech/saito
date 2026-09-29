CREATE TABLE IF NOT EXISTS listing_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- One row per fulfillment-block inclusion of a sale of one listing inclusion.
  -- Competing blocks that consume the same listing each keep their own row.
  signature TEXT NOT NULL,
  block_hash_listed TEXT NOT NULL DEFAULT '',

  block_id_sold INTEGER NOT NULL DEFAULT 0,
  block_hash_sold TEXT NOT NULL DEFAULT '',
  transaction_id_sold INTEGER NOT NULL DEFAULT 0,
  longest_chain_sold INTEGER NOT NULL DEFAULT 0,

  buyer TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  sold_at INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS listing_sales_inclusion_uidx
  ON listing_sales (signature, block_hash_listed, block_hash_sold);

CREATE INDEX IF NOT EXISTS listing_sales_sold_chain_idx
  ON listing_sales (block_id_sold, block_hash_sold);
