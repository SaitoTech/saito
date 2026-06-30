CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  signature TEXT NOT NULL UNIQUE,

  nft_id TEXT NOT NULL,
  seller TEXT DEFAULT '',

  quantity INTEGER NOT NULL DEFAULT 1,
  price INTEGER NOT NULL DEFAULT 0,

  access_hash TEXT DEFAULT '',
  access_script TEXT NOT NULL DEFAULT '',
  p2sh_address TEXT DEFAULT '',

  block_id INTEGER NOT NULL DEFAULT 0,
  block_hash TEXT NOT NULL DEFAULT '',
  transaction_id INTEGER NOT NULL DEFAULT 0,
  slip_id INTEGER NOT NULL DEFAULT 0,

  longest_chain INTEGER NOT NULL DEFAULT 1,
  on_chain INTEGER NOT NULL DEFAULT 1,
  spent INTEGER NOT NULL DEFAULT 0,

  utxo_slip1 TEXT DEFAULT '',
  utxo_slip2 TEXT DEFAULT '',
  utxo_slip3 TEXT DEFAULT '',

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS listings_chain_idx
  ON listings (block_id, block_hash);

CREATE INDEX IF NOT EXISTS listings_bucket_idx
  ON listings (nft_id, price, on_chain, spent);
