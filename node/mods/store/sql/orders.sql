CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  order_tx_sig TEXT NOT NULL,

  buyer TEXT NOT NULL DEFAULT '',
  nft_id TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,

  payment_tx_sig TEXT NOT NULL,
  payment_output_index INTEGER NOT NULL DEFAULT 0,
  payment_amount INTEGER NOT NULL DEFAULT 0,
  payment_utxo_slip TEXT NOT NULL DEFAULT '',

  block_id_received INTEGER NOT NULL DEFAULT 0,
  block_hash_received TEXT NOT NULL DEFAULT '',
  transaction_id_received INTEGER NOT NULL DEFAULT 0,
  longest_chain_received INTEGER NOT NULL DEFAULT 1,

  settlement_tx_sig TEXT NOT NULL DEFAULT '',

  block_id_fulfilled INTEGER NOT NULL DEFAULT 0,
  block_hash_fulfilled TEXT NOT NULL DEFAULT '',
  transaction_id_fulfilled INTEGER NOT NULL DEFAULT 0,
  longest_chain_fulfilled INTEGER NOT NULL DEFAULT 0,

  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_tx_sig_uidx
  ON orders (order_tx_sig);

CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_utxo_uidx
  ON orders (payment_tx_sig, payment_output_index);

CREATE INDEX IF NOT EXISTS orders_pending_idx
  ON orders (status, longest_chain_received, id)
  WHERE status IN ('pending', 'settling');

CREATE INDEX IF NOT EXISTS orders_received_chain_idx
  ON orders (block_id_received, block_hash_received);

CREATE INDEX IF NOT EXISTS orders_fulfilled_chain_idx
  ON orders (block_id_fulfilled, block_hash_fulfilled);

CREATE INDEX IF NOT EXISTS orders_bucket_idx
  ON orders (nft_id, price);
