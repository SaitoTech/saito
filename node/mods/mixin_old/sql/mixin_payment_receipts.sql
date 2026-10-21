CREATE TABLE IF NOT EXISTS mixin_payment_receipts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id        INTEGER NOT NULL,                -- FK -> mixin_payment_requests.id
  address_id        INTEGER NOT NULL,                -- FK -> mixin_payment_addresses.id
  recipient_pubkey  TEXT NOT NULL,                   -- who receives SAITO
  issued_amount     TEXT,                            -- amount of SAITO needs to be issued
  status            TEXT NOT NULL CHECK (status IN ('pending','issuing','succeeded','failed','cancelled')),
  reason            TEXT,                            -- error text / failure reason
  tx                TEXT,                            -- serialized tx
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
