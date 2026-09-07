CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  signature TEXT NOT NULL UNIQUE,

  nft_id TEXT NOT NULL,
  seller TEXT DEFAULT '',
  category TEXT DEFAULT 'Other',

  quantity INTEGER NOT NULL DEFAULT 1,
  price INTEGER NOT NULL DEFAULT 0,

  access_hash TEXT DEFAULT '',
  access_script TEXT NOT NULL DEFAULT '',
  p2sh_address TEXT DEFAULT '',

  slip_id INTEGER NOT NULL DEFAULT 0,

  block_id_listed INTEGER NOT NULL DEFAULT 0,
  block_hash_listed TEXT NOT NULL DEFAULT '',
  transaction_id_listed INTEGER NOT NULL DEFAULT 0,
  longest_chain_listed INTEGER NOT NULL DEFAULT 1,

  block_id_sold INTEGER NOT NULL DEFAULT 0,
  block_hash_sold TEXT NOT NULL DEFAULT '',
  transaction_id_sold INTEGER NOT NULL DEFAULT 0,
  longest_chain_sold INTEGER NOT NULL DEFAULT 0,

  note TEXT NOT NULL DEFAULT '',
  buyer TEXT NOT NULL DEFAULT '',
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  sold_at INTEGER NOT NULL DEFAULT 0,

  on_chain INTEGER NOT NULL DEFAULT 1,

  utxo_slip1 TEXT DEFAULT '',
  utxo_slip2 TEXT DEFAULT '',
  utxo_slip3 TEXT DEFAULT '',

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS listings_listed_chain_idx
  ON listings (block_id_listed, block_hash_listed);

CREATE INDEX IF NOT EXISTS listings_sold_chain_idx
  ON listings (block_id_sold, block_hash_sold);

CREATE INDEX IF NOT EXISTS listings_bucket_idx
  ON listings (nft_id, price, longest_chain_listed, longest_chain_sold);
