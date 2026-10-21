CREATE TABLE IF NOT EXISTS mixin_payment_addresses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker            TEXT NOT NULL,
  address           TEXT NOT NULL,
  asset_id          TEXT NOT NULL,
  chain_id          TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  reserved_until    INTEGER NOT NULL,
  reserved_by       TEXT NOT NULL,
  UNIQUE (address, asset_id, chain_id)
)