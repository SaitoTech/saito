CREATE TABLE IF NOT EXISTS mixin_payments_requests (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id           INTEGER NOT NULL,
  requested_by         TEXT NOT NULL,
  amount               TEXT NOT NULL,
  tx                   TEXT NOT NULL,
  status               TEXT NOT NULL CHECK ( status IN ('unpaid', 'paid') ),
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
);
