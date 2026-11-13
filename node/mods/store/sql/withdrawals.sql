CREATE TABLE IF NOT EXISTS store_withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  requester_publickey TEXT NOT NULL,
  treasury_publickey TEXT NOT NULL,
  ticker TEXT NOT NULL,
  saito_amount TEXT NOT NULL,
  withdrawal_amount TEXT NOT NULL,
  withdrawal_address TEXT NOT NULL DEFAULT '',
  transfer_uuids TEXT NOT NULL,
  payment_uuids TEXT NOT NULL,
  quote_timestamp TEXT NOT NULL,
  quote_signature TEXT NOT NULL,
  quote_data TEXT NOT NULL,
  saito_tx_sig TEXT NOT NULL,
  saito_tx TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  mixin_transfer_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS store_withdrawals_tx_sig_uidx
  ON store_withdrawals (saito_tx_sig);

CREATE UNIQUE INDEX IF NOT EXISTS store_withdrawals_request_uidx
  ON store_withdrawals (request_id);
