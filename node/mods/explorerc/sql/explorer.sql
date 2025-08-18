CREATE TABLE blocks (
    id INTEGER PRIMARY KEY,
    timestamp INTEGER,
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

CREATE TABLE tx (
    id TEXT PRIMARY KEY,
    block_id INTEGER,
    timestamp INTEGER,
    transaction_type TEXT,
    signature TEXT,
    total_in INTEGER,
    total_out INTEGER,
    total_fees INTEGER,
    total_work_for_me INTEGER,
    cumulative_fees INTEGER,
    txs_replacements INTEGER,
    lc BOOLEAN,
    FOREIGN KEY(block_id) REFERENCES block(id)
);

CREATE TABLE tos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_id INTEGER,
    tx_sig TEXT,
    public_key TEXT,
    amount INTEGER,
    slip_type TEXT,
    slip_index INTEGER,
    block_id INTEGER,
    tx_ordinal INTEGER,
    lc BOOLEAN,
    FOREIGN KEY(tx_id) REFERENCES tx(id)
);

CREATE TABLE froms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_id INTEGER,
    tx_sig TEXT,
    public_key TEXT,
    amount INTEGER,
    slip_type TEXT,
    slip_index INTEGER,
    block_id INTEGER,
    tx_ordinal INTEGER,
    lc BOOLEAN,
    FOREIGN KEY(tx_id) REFERENCES tx(id)
);
