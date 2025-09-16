CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER DEFAULT '' ,
  listing_id INTEGER DEFAULT 0 ,
  tx TEXT DEFAULT '' ,
  tx_sig TEXT DEFAULT '' ,
  sender TEXT DEFAULT '',
  recipient TEXT DEFAULT '',
  tx_type INTEGER DEFAULT 0 ,
  lc INTEGER DEFAULT 0,
  bsh TEXT DEFAULT '' ,
  bid INTEGER DEFAULT 0,
  tid TEXT DEFAULT '' ,
  UNIQUE (tx_sig) ,
  PRIMARY KEY(id ASC)
);

