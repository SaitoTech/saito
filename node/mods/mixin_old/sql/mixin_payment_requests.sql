CREATE TABLE IF NOT EXISTS mixin_payment_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  address_id    INTEGER NOT NULL,
  requested_by  TEXT NOT NULL,
  expected_amount        TEXT NOT NULL,
  issue_amount TEXT NOT NULL,  
  tx            TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('unpaid', 'paid')),
  created_at    INTEGER,
  updated_at    INTEGER
);
