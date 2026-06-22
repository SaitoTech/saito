CREATE TABLE IF NOT EXISTS auto_migration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_key TEXT DEFAULT "",
  ticker TEXT DEFAULT "",
  mixin TEXT DEFAULT "",
  nolan_received INTEGER DEFAULT 0,
  created_at  INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('awaiting_mixin','pending','issuing','succeeded','failed')),
  tx_sig TEXT DEFAULT "",
  blk_id INTEGER DEFAULT 0,
  issued_at INTEGER DEFAULT 0,
  announcement_hash TEXT DEFAULT ""
);
