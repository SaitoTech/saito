CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  purpose TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'automatic'
    CHECK (mode IN ('automatic', 'manual')),
  payload TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL DEFAULT '',
  requester_publickey TEXT NOT NULL DEFAULT '',
  recipient_publickey TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inbound_awaiting'
    CHECK (status IN (
      'inbound_awaiting',
      'inbound_broadcast',
      'inbound_confirmed',
      'outbound_awaiting',
      'outbound_broadcast',
      'outbound_confirmed',
      'treasury_submitted',
      'treasury_accepted',
      'treasury_rejected',
      'succeeded',
      'failed',
      'cancelled',
      'other'
    )),

  email TEXT NOT NULL DEFAULT '',
  publickey TEXT NOT NULL DEFAULT '',

  inbound_ticker TEXT NOT NULL DEFAULT '',
  inbound_asset_id TEXT NOT NULL DEFAULT '',
  inbound_chain_id TEXT NOT NULL DEFAULT '',
  inbound_amount TEXT NOT NULL DEFAULT '',
  inbound_address TEXT NOT NULL DEFAULT '',
  inbound_sender TEXT NOT NULL DEFAULT '',
  inbound_mixin_user_id TEXT NOT NULL DEFAULT '',
  inbound_confirmations INTEGER NOT NULL DEFAULT 0,
  inbound_confirmations_required INTEGER NOT NULL DEFAULT 0,

  inbound_tx TEXT NOT NULL DEFAULT '',
  inbound_tx_sig TEXT NOT NULL DEFAULT '',
  inbound_tx_hash TEXT NOT NULL DEFAULT '',
  inbound_tx_id TEXT NOT NULL DEFAULT '',
  inbound_created_at INTEGER,
  inbound_received_at INTEGER,
  inbound_settled_at INTEGER,
  inbound_block_id INTEGER,
  inbound_block_hash TEXT NOT NULL DEFAULT '',
  inbound_confirmation_block_id INTEGER,
  inbound_longest_chain INTEGER,

  outbound_ticker TEXT NOT NULL DEFAULT '',
  outbound_asset_id TEXT NOT NULL DEFAULT '',
  outbound_chain_id TEXT NOT NULL DEFAULT '',
  outbound_amount TEXT NOT NULL DEFAULT '',
  outbound_address TEXT NOT NULL DEFAULT '',
  outbound_sender TEXT NOT NULL DEFAULT '',
  outbound_mixin_user_id TEXT NOT NULL DEFAULT '',
  outbound_confirmations_required INTEGER NOT NULL DEFAULT 0,

  outbound_tx TEXT NOT NULL DEFAULT '',
  outbound_tx_sig TEXT NOT NULL DEFAULT '',
  outbound_tx_hash TEXT NOT NULL DEFAULT '',
  outbound_tx_id TEXT NOT NULL DEFAULT '',
  outbound_created_at INTEGER,
  outbound_sent_at INTEGER,
  outbound_settled_at INTEGER,
  outbound_block_id INTEGER,
  outbound_block_hash TEXT NOT NULL DEFAULT '',
  outbound_confirmation_block_id INTEGER,
  outbound_longest_chain INTEGER,

  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  locked_by TEXT NOT NULL DEFAULT '',
  locked_until INTEGER,
  last_error TEXT NOT NULL DEFAULT '',
  excluded INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- inbound-payment-uniqueness
-- One real Mixin transaction hash belongs to one transfer. Empty hashes are
-- still waiting for a payment. admin-test is the admin testing sentinel and
-- is not a Mixin transaction hash; that exact value may be reused.
CREATE UNIQUE INDEX IF NOT EXISTS transfers_inbound_tx_hash_uidx
  ON transfers (inbound_tx_hash)
  WHERE inbound_tx_hash <> ''
    AND inbound_tx_hash <> 'admin-test';
