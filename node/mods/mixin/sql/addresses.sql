CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mixin_user_id TEXT NOT NULL,
  publickey TEXT NOT NULL DEFAULT '',
  asset_id TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS addresses_wallet_asset_uidx
  ON addresses (mixin_user_id, asset_id);
