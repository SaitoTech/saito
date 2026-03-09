CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nft_id TEXT DEFAULT '' ,			
  nfttx_sig TEXT DEFAULT '' ,			
  delisting_nfttx_sig TEXT DEFAULT '' ,			
  status INTEGER DEFAULT 0 ,			
  seller TEXT DEFAULT '' ,
  email TEXT DEFAULT '', 
  buyer TEXT DEFAULT '' ,
  title TEXT DEFAULT '' ,
  description TEXT DEFAULT '' ,
  created_at INTEGER DEFAULT 0 ,
  reserve_price INTEGER DEFAULT 0
);

