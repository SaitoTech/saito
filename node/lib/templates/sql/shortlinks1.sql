CREATE TABLE IF NOT EXISTS shortlinks (
    id           TEXT PRIMARY KEY,
    shortlink    TEXT UNIQUE,
    link         TEXT NOT NULL,
    title        TEXT DEFAULT '',
    creator      TEXT DEFAULT '',
    created_at   INTEGER DEFAULT 0,
    expires_at   INTEGER DEFAULT 0,
    max_uses     INTEGER DEFAULT 0,
    uses         INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS shortlinks_shortlink_idx
    ON shortlinks(shortlink);

CREATE INDEX IF NOT EXISTS shortlinks_created_idx
    ON shortlinks(created_at);

CREATE INDEX IF NOT EXISTS shortlinks_expires_idx
    ON shortlinks(expires_at);
