# Migration payout reliability

The `processing_payments` guard prevents overlapping payout sweeps in a single migration-server
process. Pending receipts that arrive during a sweep are intentionally left for the next block.

Longer-term work:

- Atomically claim each database row by changing it from `pending` to `issuing` before initiating
  the payout. Only send when the conditional update changes exactly one row.
- Support multiple migration-server processes by using the database claim as the source of truth,
  rather than relying on an in-memory lock.
- Derive a stable payout reference from the `auto_migration` row ID instead of generating a random
  hash after restart.
- Persist the outgoing transaction signature immediately after broadcasting it.
- Match confirmations using the stable payout reference or transaction signature. Use recipient and
  amount only as validation, not as the payment identity.
- Define a reconciliation state and operator workflow for ambiguous send failures. Do not
  automatically retry a payout that may already have been broadcast.
- Add a durable uniqueness constraint for incoming wrapped-token payment identifiers so the same
  deposit cannot create multiple payout rows.
- Add regression tests for overlapping block callbacks, process restarts, equal-value migrations to
  the same recipient, ambiguous send failures, and unrelated outgoing SAITO transfers.
