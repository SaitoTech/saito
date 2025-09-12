CREATE TABLE IF NOT EXISTS listings (
  id INTEGER DEFAULT '',
  nft_id TEXT DEFAULT '',
  nft_tx TEXT DEFAULT '',
  nft_sig TEXT DEFAULT '',
  seller TEXT DEFAULT '',
  active INTEGER DEFAULT 0 ,
  lc INTEGER DEFAULT 0,
  bsh TEXT DEFAULT '' ,
  bid INTEGER DEFAULT 0,
  tid TEXT DEFAULT '' ,
  lock_block INTEGER DEFAULT 0,
  nft_tx_broadcast INTEGER DEFAULT 0 ,
  nft_tx_confirmed INTEGER DEFAULT 0 ,
  nft_tx_bsh TEXT DEFAULT '' ,
  nft_tx_bid INTEGER DEFAULT 0 ,
  UNIQUE (nft_id),
  PRIMARY KEY(id ASC)
);

