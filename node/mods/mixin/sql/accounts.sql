CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publickey TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  ciphertext TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_publickey_user_uidx
  ON accounts (publickey, user_id);
