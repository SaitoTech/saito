CREATE TABLE IF NOT EXISTS treasury (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL CHECK (origin IN ('local', 'remote')),
  requester_publickey TEXT NOT NULL DEFAULT '',
  source_transfer_id INTEGER NOT NULL,
  request_tx TEXT NOT NULL DEFAULT '',
  request_tx_sig TEXT NOT NULL DEFAULT '',
  request_payload TEXT NOT NULL DEFAULT '',
  transfer_id INTEGER,
  remote_transfer_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'error')),
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- One remote request identity belongs to one Treasury audit row.
CREATE UNIQUE INDEX IF NOT EXISTS treasury_remote_request_uidx
  ON treasury (requester_publickey, source_transfer_id)
  WHERE origin = 'remote';

-- The application server stores one signed request for each of its transfers.
CREATE UNIQUE INDEX IF NOT EXISTS treasury_local_source_uidx
  ON treasury (source_transfer_id)
  WHERE origin = 'local';

-- A signed request is not recorded twice.
CREATE UNIQUE INDEX IF NOT EXISTS treasury_request_sig_uidx
  ON treasury (request_tx_sig)
  WHERE request_tx_sig <> '';
