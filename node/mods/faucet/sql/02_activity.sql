-- Faucet activity: one row per request, updated as payment and chain status change.
-- Does not store OAuth tokens/secrets or the Faucet private key.
--
-- request_status: accepted | rejected
-- payment_status: none | queued | broadcast | included | failed | orphaned

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,

  requester_publickey TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  provider_user_id TEXT NOT NULL DEFAULT '',
  provider_username TEXT NOT NULL DEFAULT '',

  requested_amount TEXT NOT NULL DEFAULT '',

  request_status TEXT NOT NULL DEFAULT '',
  request_reason TEXT NOT NULL DEFAULT '',

  request_tx_signature TEXT NOT NULL DEFAULT '',
  request_block_id TEXT NOT NULL DEFAULT '',
  request_block_hash TEXT NOT NULL DEFAULT '',
  request_longest_chain INTEGER NOT NULL DEFAULT 0,

  payment_status TEXT NOT NULL DEFAULT 'none',
  payment_tx_signature TEXT NOT NULL DEFAULT '',
  paid_at INTEGER NOT NULL DEFAULT 0,
  payment_block_id TEXT NOT NULL DEFAULT '',
  payment_block_hash TEXT NOT NULL DEFAULT '',
  payment_longest_chain INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS activity_created_at_idx
  ON activity (created_at);

CREATE INDEX IF NOT EXISTS activity_requester_idx
  ON activity (requester_publickey);

CREATE INDEX IF NOT EXISTS activity_payment_status_idx
  ON activity (payment_status);

CREATE INDEX IF NOT EXISTS activity_payment_sig_idx
  ON activity (payment_tx_signature);

CREATE INDEX IF NOT EXISTS activity_request_block_hash_idx
  ON activity (request_block_hash);

CREATE INDEX IF NOT EXISTS activity_payment_block_hash_idx
  ON activity (payment_block_hash);
