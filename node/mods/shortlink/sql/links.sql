CREATE TABLE IF NOT EXISTS links (
  id          TEXT PRIMARY KEY,
  module      TEXT DEFAULT "",
  path        TEXT DEFAULT "",
  params      TEXT DEFAULT "",
  title       TEXT DEFAULT "",
  creator     TEXT DEFAULT "",
  created_at  INTEGER DEFAULT 0,
  expires_at  INTEGER DEFAULT 0,
  max_uses    INTEGER DEFAULT 0,
  uses        INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS links_expires_at_idx ON links (expires_at);
