CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  purpose TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'awaiting_inbound'
    CHECK (status IN (
      'awaiting_inbound',
      'inbound_pending',
      'inbound_observed',
      'inbound_confirmed',
      'awaiting_outbound',
      'outbound_pending',
      'outbound_sent',
      'outbound_observed',
      'outbound_confirmed',
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

  inbound_tx TEXT NOT NULL DEFAULT '',
  inbound_tx_sig TEXT NOT NULL DEFAULT '',
  inbound_tx_hash TEXT NOT NULL DEFAULT '',
  inbound_created_at INTEGER,
  inbound_received_at INTEGER,
  inbound_settled_at INTEGER,
  inbound_block_id INTEGER,
  inbound_block_hash TEXT NOT NULL DEFAULT '',
  inbound_longest_chain INTEGER,

  -- Outgoing asset and endpoint
  outbound_ticker TEXT NOT NULL DEFAULT '',
  outbound_asset_id TEXT NOT NULL DEFAULT '',
  outbound_chain_id TEXT NOT NULL DEFAULT '',
  outbound_amount TEXT NOT NULL DEFAULT '',
  outbound_address TEXT NOT NULL DEFAULT '',
  outbound_sender TEXT NOT NULL DEFAULT '',
  outbound_mixin_user_id TEXT NOT NULL DEFAULT '',

  -- Outgoing transaction evidence
  outbound_tx TEXT NOT NULL DEFAULT '',
  outbound_tx_sig TEXT NOT NULL DEFAULT '',
  outbound_tx_hash TEXT NOT NULL DEFAULT '',
  outbound_created_at INTEGER,
  outbound_sent_at INTEGER,
  outbound_settled_at INTEGER,
  outbound_block_id INTEGER,
  outbound_block_hash TEXT NOT NULL DEFAULT '',
  outbound_longest_chain INTEGER,

  -- queue / recovery metadata
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  locked_by TEXT NOT NULL DEFAULT '',
  locked_until INTEGER,
  last_error TEXT NOT NULL DEFAULT '',

  -- Database-record timestamps
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

