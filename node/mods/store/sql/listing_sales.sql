CREATE TABLE IF NOT EXISTS listing_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- One row per fulfillment-block inclusion of a sale of one listing inclusion.
  -- Competing blocks that consume the same listing each keep their own row.
  signature TEXT NOT NULL,
  block_hash_listed TEXT NOT NULL DEFAULT '',

  block_id_sold INTEGER NOT NULL DEFAULT 0,
  block_hash_sold TEXT NOT NULL DEFAULT '',
  transaction_id_sold INTEGER NOT NULL DEFAULT 0,
  longest_chain_sold INTEGER NOT NULL DEFAULT 0,

  buyer TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  sold_at INTEGER NOT NULL DEFAULT 0,

  -- Snapshot of this sale. Later listing edits do not change what was earned.
  seller TEXT NOT NULL DEFAULT '',
  web3_ticker TEXT NOT NULL DEFAULT '',
  web3_amount TEXT NOT NULL DEFAULT '',

  -- Filled together when this sale is included in a Mixin payout.
  web3_payment_withdrawal_processed INTEGER NOT NULL DEFAULT 0,
  web3_payment_withdrawal_address TEXT NOT NULL DEFAULT '',
  web3_payment_withdrawal_publickey TEXT NOT NULL DEFAULT '',
  web3_payment_withdrawal_request TEXT NOT NULL DEFAULT '',
  web3_payment_withdrawal_created_at INTEGER NOT NULL DEFAULT 0,
  web3_payment_withdrawal_mixin_uuid TEXT NOT NULL DEFAULT '',

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS listing_sales_inclusion_uidx
  ON listing_sales (signature, block_hash_listed, block_hash_sold);

CREATE INDEX IF NOT EXISTS listing_sales_sold_chain_idx
  ON listing_sales (block_id_sold, block_hash_sold);
