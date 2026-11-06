CREATE TABLE IF NOT EXISTS order_refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_tx_sig TEXT NOT NULL,
  payment_output_index INTEGER NOT NULL DEFAULT 0,
  block_hash_received TEXT NOT NULL DEFAULT '',
  block_id_received INTEGER NOT NULL DEFAULT 0,
  order_tx_sig TEXT NOT NULL DEFAULT '',
  order_id INTEGER,
  buyer TEXT NOT NULL DEFAULT '',
  refund_publickey TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  utxo_slip TEXT NOT NULL DEFAULT '',
  access_script TEXT NOT NULL DEFAULT '',
  payment_amount INTEGER NOT NULL DEFAULT 0,
  refund_tx_sig TEXT NOT NULL DEFAULT '',
  refund_tx TEXT NOT NULL DEFAULT '',
  refund_status TEXT NOT NULL DEFAULT '',
  refund_prepared_at INTEGER NOT NULL DEFAULT 0,
  refund_broadcast_attempts INTEGER NOT NULL DEFAULT 0,
  block_id_refunded INTEGER NOT NULL DEFAULT 0,
  block_hash_refunded TEXT NOT NULL DEFAULT '',
  transaction_id_refunded INTEGER NOT NULL DEFAULT 0,
  longest_chain_refunded INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS order_refunds_payment_uidx
  ON order_refunds (payment_tx_sig, payment_output_index, block_hash_received);

CREATE UNIQUE INDEX IF NOT EXISTS order_refunds_tx_sig_uidx
  ON order_refunds (refund_tx_sig)
  WHERE refund_tx_sig <> '';
