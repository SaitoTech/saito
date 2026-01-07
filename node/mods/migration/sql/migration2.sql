CREATE TABLE IF NOT EXISTS auto_migration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publickey TEXT DEFAULT "",
  mixin TEXT DEFAULT "",
  nolan_received INTEGER DEFAULT 0,
  created_at  INTEGER DEFAULT 0,
  saito_isssued BOOLEAN DEFAULT false,
  tx_sig TEXT DEFAULT "",
  blk_id INTEGER DEFAULT 0,
  issued_at INTEGER DEFAULT 0
);

