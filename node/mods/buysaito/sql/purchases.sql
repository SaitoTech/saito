CREATE TABLE IF NOT EXISTS purchases (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  initiator_pubkey  TEXT DEFAULT "",
  recipient_pubkey  TEXT DEFAULT "",
  ticker            TEXT DEFAULT "",
  mixin_user_id     TEXT DEFAULT "", -- mixin.user_id (to distinguish mixin accounts)
  destination       TEXT DEFAULT "", -- mixin account deposit address
  issue_amount      NUMBER DEFAULT 0,
  expected_deposit  NUMBER DEFAULT 0,
  external_address  TEXT DEFAULT "",
  status            TEXT NOT NULL CHECK (status IN ('new', 'pending','issuing','succeeded','failed','cancelled')),
  active            NUMBER DEFAULT 1,
  tx                TEXT,
  created_at        INTEGER DEFAULT 0,
  updated_at        INTEGER DEFAULT 0
);
