CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mixin_user_id TEXT NOT NULL,
  publickey TEXT NOT NULL DEFAULT '',
  ticker TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  address TEXT NOT NULL,
  reserved_by TEXT NOT NULL DEFAULT '',
  reserved_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);

-- One deposit address per Mixin wallet per asset.
CREATE UNIQUE INDEX IF NOT EXISTS addresses_wallet_asset_uidx
  ON addresses (mixin_user_id, asset_id);

-- An address is free when reserved_until is 0 or already in the past.
CREATE INDEX IF NOT EXISTS addresses_available_idx
  ON addresses (ticker, reserved_until);
