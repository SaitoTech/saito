CREATE TABLE IF NOT EXISTS blocks (
    block_id INTEGER NOT NULL,
    block_hash TEXT NOT NULL,

    treasury INTEGER,
    graveyard INTEGER,

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

    burn_fee INTEGER,
    difficulty INTEGER,
    previous_block_unpaid INTEGER,
    has_golden_ticket INTEGER,

    utxo INTEGER,
    total_supply INTEGER,
    calculated_total_supply TEXT,
    utxo_graveyard_treasury_total TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS blocks_hash_id_uidx
    ON blocks (block_hash, block_id);
