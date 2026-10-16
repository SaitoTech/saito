CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publickey TEXT NOT NULL,
  milestone INTEGER NOT NULL,
  day INTEGER NOT NULL,
  nft_sig TEXT,
  UNIQUE (publickey, milestone)
);
