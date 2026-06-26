ALTER TABLE auto_migration ADD COLUMN announcement_hash TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS auto_migration_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_key TEXT DEFAULT "",
  ticker TEXT DEFAULT "",
  mixin TEXT DEFAULT "",
  nolan_received INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('awaiting_mixin','pending','issuing','succeeded','failed')),
  tx_sig TEXT DEFAULT "",
  blk_id INTEGER DEFAULT 0,
  issued_at INTEGER DEFAULT 0,
  announcement_hash TEXT DEFAULT ""
);

INSERT INTO auto_migration_new (
  id, public_key, ticker, mixin, nolan_received, created_at, status,
  tx_sig, blk_id, issued_at, announcement_hash
)
SELECT
  id, public_key, ticker, mixin, nolan_received, created_at, status,
  tx_sig, blk_id, issued_at, COALESCE(announcement_hash, '')
FROM auto_migration;

DROP TABLE auto_migration;
ALTER TABLE auto_migration_new RENAME TO auto_migration;
