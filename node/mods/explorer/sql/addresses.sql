CREATE TABLE IF NOT EXISTS addresses (
    _id INTEGER PRIMARY KEY AUTOINCREMENT,

    publickey TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    block_hash TEXT NOT NULL,
    block_id INTEGER NOT NULL,

    is_longest_chain INTEGER NOT NULL DEFAULT 1,
    recipient INTEGER NOT NULL,
    delta INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS addresses_publickey_tx_hash_uidx
    ON addresses (publickey, tx_hash);

CREATE INDEX IF NOT EXISTS addresses_publickey_block_id_idx
    ON addresses (publickey, block_id DESC);

CREATE INDEX IF NOT EXISTS addresses_block_id_idx
    ON addresses (block_id);
