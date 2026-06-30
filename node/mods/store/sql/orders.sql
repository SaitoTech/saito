CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  order_tx_sig TEXT NOT NULL,

  buyer TEXT NOT NULL DEFAULT '',
  nft_id TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,

  payment_tx_sig TEXT NOT NULL,
  payment_output_index INTEGER NOT NULL DEFAULT 0,
  payment_amount INTEGER NOT NULL DEFAULT 0,

  block_id_added INTEGER NOT NULL DEFAULT 0,
  block_hash_added TEXT NOT NULL DEFAULT '',
  transaction_id_added INTEGER NOT NULL DEFAULT 0,
  longest_chain_added INTEGER NOT NULL DEFAULT 1,

  settlement_tx_sig TEXT NOT NULL DEFAULT '',

  block_id_fulfilled INTEGER NOT NULL DEFAULT 0,
  block_hash_fulfilled TEXT NOT NULL DEFAULT '',
  transaction_id_fulfilled INTEGER NOT NULL DEFAULT 0,
  longest_chain_fulfilled INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_utxo_uidx
  ON orders (payment_tx_sig, payment_output_index);

CREATE INDEX IF NOT EXISTS orders_open_idx
  ON orders (nft_id, price, longest_chain_added)
  WHERE block_id_fulfilled = 0 AND longest_chain_added = 1;

CREATE INDEX IF NOT EXISTS orders_added_chain_idx
  ON orders (block_id_added, block_hash_added);

CREATE INDEX IF NOT EXISTS orders_fulfilled_chain_idx
  ON orders (block_id_fulfilled, block_hash_fulfilled);

CREATE INDEX IF NOT EXISTS orders_bucket_idx
  ON orders (nft_id, price);
