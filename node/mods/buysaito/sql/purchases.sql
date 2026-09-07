CREATE TABLE IF NOT EXISTS purchases (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  initiator_pubkey  TEXT DEFAULT "",
  recipient_pubkey  TEXT DEFAULT "",
  ticker            TEXT DEFAULT "",
  mixin_user_id     TEXT DEFAULT "", -- mixin.user_id (to distinguish mixin accounts)
  destination       TEXT DEFAULT "", -- mixin account deposit address
  issue_amount      NUMBER DEFAULT 0,
  expected_deposit  NUMBER DEFAULT 0,
  external_address  TEXT DEFAULT "",  -- address the incoming payment is from (for checking external block explorer)
  status            TEXT NOT NULL CHECK (status IN ('new', 'pending', 'confirmed','failed','cancelled')),
  paid              TEXT DEFAULT "",  -- tx.signature of the Saito issuance
  issuance_tx       TEXT DEFAULT "",  -- exact signed issuance transaction for restart-safe rebroadcast
  issuance_at       INTEGER DEFAULT 0,
  issuance_block_id INTEGER DEFAULT 0,
  issuance_block_hash TEXT DEFAULT "",
  active            NUMBER DEFAULT 1, -- simpler flag than distinguishing the five statuses above
  tx                TEXT,             -- transaction user wants sent on completion
  created_at        INTEGER DEFAULT 0,
  updated_at        INTEGER DEFAULT 0
);
