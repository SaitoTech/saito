CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY,
    timestamp INTEGER,
    type TEXT,
    hash TEXT,
    previous_block_hash TEXT,
    creator TEXT,
    merkle_root TEXT,
    signature TEXT,
    graveyard INTEGER,
    treasury INTEGER,
    total_fees INTEGER,
    total_fees_new INTEGER,
    total_fees_atr INTEGER,
    total_fees_cumulative INTEGER,
    avg_total_fees INTEGER,
    avg_total_fees_new INTEGER,
    avg_total_fees_atr INTEGER,
    total_payout_routing INTEGER,
    total_payout_mining INTEGER,
    total_payout_treasury INTEGER,
    total_payout_graveyard INTEGER,
    total_payout_atr INTEGER,
    avg_payout_routing INTEGER,
    avg_payout_mining INTEGER,
    avg_payout_treasury INTEGER,
    avg_payout_graveyard INTEGER,
    avg_payout_atr INTEGER,
    avg_fee_per_byte INTEGER,
    fee_per_byte INTEGER,
    avg_nolan_rebroadcast_per_block INTEGER,
    burnfee INTEGER,
    difficulty INTEGER,
    previous_block_unpaid INTEGER,
    lc BOOLEAN
);

CREATE TABLE IF NOT EXISTS txs (
    signature TEXT PRIMARY KEY,
    block_id INTEGER,
    timestamp INTEGER,
    transaction_type TEXT,
    total_in BIGINT,
    total_out BIGINT,
    total_fees INTEGER,
    work_available_to_creator INTEGER,
    work_available_to_me INTEGER,
    work_cumulative INTEGER,
    txs_replacements INTEGER,
    lc BOOLEAN,
    FOREIGN KEY(block_id) REFERENCES block(id)
);

CREATE TABLE IF NOT EXISTS tos (
    utxo_key TEXT PRIMARY KEY,
    tx_sig TEXT,
    public_key TEXT,
    amount BIGINT,
    slip_type TEXT,
    slip_index INTEGER,
    block_id INTEGER,
    tx_ordinal INTEGER,
    lc BOOLEAN,
    FOREIGN KEY(tx_sig) REFERENCES tx(signature)
);

CREATE TABLE IF NOT EXISTS froms (
    utxo_key TEXT PRIMARY KEY,
    tx_sig TEXT,
    public_key TEXT,
    amount BIGINT,
    slip_type TEXT,
    slip_index INTEGER,
    block_id INTEGER,
    tx_ordinal INTEGER,
    lc BOOLEAN,
    FOREIGN KEY(tx_sig) REFERENCES tx(signature)
);

CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER,
    tx_sig TEXT,
    timestamp INTEGER,
    from_key TEXT,
    to_key TEXT,
    amount BIGINT
);

CREATE INDEX IF NOT EXISTS from_idx ON ledger (from_key);
CREATE INDEX IF NOT EXISTS to_idx ON ledger (to_key);
