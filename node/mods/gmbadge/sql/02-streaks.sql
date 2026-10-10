CREATE TABLE IF NOT EXISTS streaks (
  publickey TEXT PRIMARY KEY,
  serial INTEGER UNIQUE,
  current INTEGER DEFAULT 0,
  longest INTEGER DEFAULT 0,
  lifetime INTEGER DEFAULT 0,
  first_day INTEGER,
  last_day INTEGER,
  badge_sig TEXT,
  badge_id TEXT,
  minted INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0
);
