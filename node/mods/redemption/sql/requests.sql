CREATE TABLE IF NOT EXISTS redemption_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nft_id TEXT NOT NULL,
  nft_type TEXT NOT NULL DEFAULT '',
  custody_utxo TEXT NOT NULL DEFAULT '',
  tx_sig TEXT NOT NULL DEFAULT '',
  requester TEXT NOT NULL DEFAULT '',
  ticker TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '',
  server_publickey TEXT NOT NULL DEFAULT '',
  blocks_required TEXT NOT NULL DEFAULT '0',
  collateral_id TEXT NOT NULL DEFAULT '',
  custody_block_id TEXT NOT NULL DEFAULT '',
  tip_block_id TEXT NOT NULL DEFAULT '',
  withdrawal_address TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- One live claim per redemption NFT. Rejected and failed rows stay as history
-- and do not block a later request.
CREATE UNIQUE INDEX IF NOT EXISTS redemption_requests_active_nft
  ON redemption_requests (nft_id)
  WHERE status IN ('new', 'pending', 'processed');
