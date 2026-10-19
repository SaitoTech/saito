CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL,
    block_hash TEXT NOT NULL,
    lc INTEGER NOT NULL DEFAULT 1,
    signature TEXT NOT NULL,
    transaction_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_block_hash_signature_uidx
    ON transactions (block_hash, signature);

CREATE INDEX IF NOT EXISTS transactions_signature_idx
    ON transactions (signature);

CREATE INDEX IF NOT EXISTS transactions_block_id_idx
    ON transactions (block_id);

CREATE INDEX IF NOT EXISTS transactions_lc_block_id_idx
    ON transactions (lc, block_id DESC);
