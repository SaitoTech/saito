-- Faucet registrations: one Saito public key → one registration → at most one issuance.
--
-- Created after a verified OAuth identity is linked to a Saito public key.
-- Does not store OAuth tokens/secrets. Does not model multi-identity linking.
--
-- issuance_status lifecycle: eligible → pending → issued
-- (pending may return to eligible only if payout was never propagated)

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Saito public key that owns this Faucet registration (exactly one row per key)
  publickey TEXT NOT NULL,

  -- Verified external identity (provider account used to register)
  -- provider: github | twitter | google | apple
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_username TEXT NOT NULL DEFAULT '',
  provider_display_name TEXT NOT NULL DEFAULT '',

  -- Provider account creation time when known (0 if provider does not supply it)
  provider_account_created_at INTEGER NOT NULL DEFAULT 0,

  -- When this registration was authenticated / created
  authenticated_at INTEGER NOT NULL DEFAULT 0,

  -- One-time issuance lifecycle
  issuance_status TEXT NOT NULL DEFAULT 'eligible'
    CHECK (issuance_status IN ('eligible', 'pending', 'issued')),

  -- Nolan amount as string (empty until issued)
  issuance_amount TEXT NOT NULL DEFAULT '',

  -- Issuance transaction signature (empty until issued)
  issuance_tx_signature TEXT NOT NULL DEFAULT '',

  issued_at INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,

  UNIQUE (publickey)
);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_publickey_uidx
  ON registrations (publickey);

CREATE INDEX IF NOT EXISTS registrations_issuance_status_idx
  ON registrations (issuance_status);

-- One provider account (e.g. one GitHub user) → one registration
CREATE UNIQUE INDEX IF NOT EXISTS registrations_provider_uid_uidx
  ON registrations (provider, provider_user_id);
