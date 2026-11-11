CREATE TABLE IF NOT EXISTS satosign_documents (
  document_id TEXT PRIMARY KEY,
  document_hash TEXT NOT NULL,
  document_data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  accessed_at INTEGER NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  is_paid INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0, 1)),
  is_encrypted INTEGER NOT NULL DEFAULT 0 CHECK (is_encrypted IN (0, 1)),
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS satosign_documents_hash_idx
  ON satosign_documents (document_hash);

CREATE INDEX IF NOT EXISTS satosign_documents_expires_at_idx
  ON satosign_documents (expires_at);

CREATE TABLE IF NOT EXISTS satosign_shares (
  document_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('sign', 'access')),
  originator_name TEXT NOT NULL,
  originator_email TEXT NOT NULL,
  document_name TEXT NOT NULL,
  recipients TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  client_key TEXT
);

CREATE INDEX IF NOT EXISTS satosign_shares_token_idx
  ON satosign_shares (token);

CREATE UNIQUE INDEX IF NOT EXISTS satosign_shares_client_key_idx
  ON satosign_shares (client_key);
