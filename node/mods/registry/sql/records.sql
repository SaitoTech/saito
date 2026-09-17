CREATE TABLE IF NOT EXISTS records (
  id INTEGER,
  identifier TEXT CHECK (length(identifier) <= 255),
  publickey TEXT,
  unixtime INTEGER,
  bid INTEGER,
  bsh TEXT,
  lock_block INTEGER DEFAULT 0,
  sig TEXT,
  signer TEXT,
  lc INTEGER,
  UNIQUE (identifier),
  PRIMARY KEY(id ASC)
);

-- SQLite does not enforce VARCHAR(n). Triggers also protect existing tables
-- without rewriting legacy identifiers and invalidating their signatures.
CREATE TRIGGER IF NOT EXISTS records_identifier_length_insert
BEFORE INSERT ON records
WHEN length(NEW.identifier) > 255
BEGIN
  SELECT RAISE(ABORT, 'Registry identifier exceeds 255 characters');
END;

CREATE TRIGGER IF NOT EXISTS records_identifier_length_update
BEFORE UPDATE OF identifier ON records
WHEN length(NEW.identifier) > 255
BEGIN
  SELECT RAISE(ABORT, 'Registry identifier exceeds 255 characters');
END;
