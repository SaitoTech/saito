CREATE TABLE IF NOT EXISTS bugs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_tx_sig TEXT NOT NULL UNIQUE,
  source_tx_sig TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'normal',
  weight INTEGER NOT NULL DEFAULT 100,
  reporter_publickey TEXT NOT NULL DEFAULT '',
  reporter_verified INTEGER NOT NULL DEFAULT 0,
  added_by_publickey TEXT NOT NULL,
  assignee_publickey TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL DEFAULT 0,
  tracked INTEGER NOT NULL DEFAULT 1,
  reply_count INTEGER NOT NULL DEFAULT 0,
  latest_metadata_tx_sig TEXT NOT NULL,
  latest_metadata_previous_tx_sig TEXT NOT NULL DEFAULT '',
  latest_metadata_block_id INTEGER NOT NULL DEFAULT 0,
  latest_metadata_tx_ordinal INTEGER NOT NULL DEFAULT 0,
  latest_metadata_timestamp INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bug_events (
  tx_sig TEXT PRIMARY KEY,
  bug_id TEXT NOT NULL,
  request TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT '',
  signer_publickey TEXT NOT NULL,
  block_id INTEGER NOT NULL DEFAULT 0,
  tx_ordinal INTEGER NOT NULL DEFAULT 0,
  tx_timestamp INTEGER NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0,
  processed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS bugs_root_tx_sig_idx ON bugs (root_tx_sig);
CREATE INDEX IF NOT EXISTS bugs_source_tx_sig_idx ON bugs (source_tx_sig);
CREATE INDEX IF NOT EXISTS bugs_status_idx ON bugs (status);
CREATE INDEX IF NOT EXISTS bugs_severity_idx ON bugs (severity);
CREATE INDEX IF NOT EXISTS bugs_priority_idx ON bugs (priority);
CREATE INDEX IF NOT EXISTS bugs_weight_idx ON bugs (weight);
CREATE INDEX IF NOT EXISTS bugs_assignee_idx ON bugs (assignee_publickey);
CREATE INDEX IF NOT EXISTS bugs_updated_at_idx ON bugs (updated_at);
CREATE INDEX IF NOT EXISTS bugs_tracked_idx ON bugs (tracked);
CREATE INDEX IF NOT EXISTS bugs_latest_metadata_tx_sig_idx ON bugs (latest_metadata_tx_sig);
CREATE INDEX IF NOT EXISTS bug_events_bug_id_idx ON bug_events (bug_id);
