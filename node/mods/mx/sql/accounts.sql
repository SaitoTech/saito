CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publickey TEXT NOT NULL,
  mixin_user_id TEXT NOT NULL DEFAULT '',
  ciphertext TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'pool')),
  created_at INTEGER NOT NULL DEFAULT 0
);

-- One restored wallet per Saito key. Extra deposit wallets are role = 'pool'.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_primary_uidx
  ON accounts (publickey)
  WHERE role = 'primary';

CREATE INDEX IF NOT EXISTS accounts_owner_idx
  ON accounts (publickey, role);

CREATE INDEX IF NOT EXISTS accounts_mixin_user_idx
  ON accounts (mixin_user_id);
