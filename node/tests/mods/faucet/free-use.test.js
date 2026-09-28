const assert = require('node:assert/strict');
const test = require('node:test');

const FaucetDB = require('../../../mods/faucet/lib/db');
const { readFaucetMode, saveFaucetMode } = require('../../../mods/faucet/lib/mode');

const DAY = 24 * 60 * 60 * 1000;

function dbWithRecord(record) {
  const db = Object.create(FaucetDB.prototype);
  db.getRecord = async () => record;
  db.insertRecord = async () => true;
  db.updateRecord = async (where, changes) => {
    assert.equal(where.publickey, record.publickey);
    assert.equal(where.issuance_status, record.issuance_status);
    record = { ...record, ...changes };
    return true;
  };
  return db;
}

test('free faucet mode survives an options save and reload', () => {
  let saves = 0;
  const app = {
    options: { faucet: {} },
    storage: { saveOptions: () => saves++ }
  };

  saveFaucetMode(app, { free: true, github: false, twitter: false });

  assert.equal(saves, 1);
  assert.equal(app.options.faucet.free_use, true);
  assert.equal(readFaucetMode(JSON.parse(JSON.stringify(app.options))).free, true);
});

test('legacy free_use option is restored as free mode', () => {
  assert.equal(readFaucetMode({ faucet: { free_use: true } }).free, true);
  assert.equal(readFaucetMode({ faucet: { mode: { free_use: true } } }).free, true);
});

test('free faucet rejects another claim within 24 hours', async () => {
  const issuedAt = 1_000_000;
  const db = dbWithRecord({
    publickey: 'alice',
    issuance_status: 'issued',
    issued_at: issuedAt,
    updated_at: issuedAt
  });

  const result = await db.prepareFreeUseClaim(
    { publickey: 'alice', provider: 'free_use', provider_user_id: 'alice' },
    issuedAt + DAY - 1,
    DAY
  );

  assert.deepEqual(result, {
    eligible: false,
    retry_at: issuedAt + DAY,
    reason: 'cooldown'
  });
});

test('free faucet makes a public key eligible after 24 hours', async () => {
  const issuedAt = 1_000_000;
  const db = dbWithRecord({
    publickey: 'alice',
    issuance_status: 'issued',
    issued_at: issuedAt,
    updated_at: issuedAt
  });

  const result = await db.prepareFreeUseClaim(
    { publickey: 'alice', provider: 'free_use', provider_user_id: 'alice' },
    issuedAt + DAY,
    DAY
  );

  assert.deepEqual(result, {
    eligible: true,
    retry_at: 0,
    reason: 'cooldown_elapsed'
  });
});

test('free faucet recovers a pending claim after the daily cooldown', async () => {
  const updatedAt = 1_000_000;
  const db = dbWithRecord({
    publickey: 'alice',
    issuance_status: 'pending',
    issued_at: 0,
    updated_at: updatedAt
  });

  const result = await db.prepareFreeUseClaim(
    { publickey: 'alice', provider: 'free_use', provider_user_id: 'alice' },
    updatedAt + DAY,
    DAY
  );

  assert.equal(result.eligible, true);
  assert.equal(result.reason, 'cooldown_elapsed');
});
