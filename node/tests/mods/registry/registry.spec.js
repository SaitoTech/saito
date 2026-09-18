const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

jest.mock(
  '../../../lib/templates/modtemplate',
  () =>
    class {
      async initialize() {}
    }
);
jest.mock('../../../mods/registry/lib/register-username', () => class {});
jest.mock('saito-js/lib/peer_service', () => ({ default: class {} }));

const Registry = require('../../../mods/registry/registry');
const { validateUsername, isRegistrationIdentifier } = require('../../../mods/registry/lib/identifier');
const schema = fs.readFileSync(path.join(__dirname, '../../../mods/registry/sql/records.sql'), 'utf8');

function registry(db) {
  const app = {
    BROWSER: 0,
    options: {},
    connection: { on: jest.fn() },
    crypto: { signMessage: jest.fn(), verifyMessage: jest.fn() },
    wallet: {
      createUnsignedTransactionWithDefaultFee: jest.fn().mockResolvedValue({
        msg: {},
        sign: jest.fn()
      })
    },
    network: { propagateTransaction: jest.fn(), sendRequestAsTransaction: jest.fn() },
    storage: {
      returnFileSystem: () => fs,
      executeDatabase: (sql) => db.exec(sql),
      queryDatabase: (sql, params) => db.all(sql, params),
      runDatabase: jest.fn((sql, params) => db.run(sql, params))
    }
  };
  const mod = new Registry(app);
  mod.publicKey = mod.registry_publickey;
  return mod;
}

describe('registry identifier limits', () => {
  let db;
  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
  });
  afterEach(async () => db.close());

  test('accepts 64 username characters and rejects 65 before creating a transaction', async () => {
    const mod = registry(db);
    await expect(mod.tryRegisterIdentifier('a'.repeat(65))).rejects.toThrow('64');
    expect(mod.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
    await expect(mod.tryRegisterIdentifier('a'.repeat(64))).resolves.toBe(true);
    const tx = mod.app.network.propagateTransaction.mock.calls[0][0];
    expect(tx.msg.identifier).toBe('a'.repeat(64) + '@saito');
    expect(tx.sign).toHaveBeenCalledTimes(1);
  });

  test.each(['', 'a b', 'a_b', '<script>', null, 123])('rejects invalid username %p', (name) => {
    expect(() => validateUsername(name)).toThrow();
  });

  test.each(['a'.repeat(65) + '@saito', 'a'.repeat(1000000), null, {}])(
    'rejects invalid registration before signing or storing',
    async (identifier) => {
      const mod = registry(db);
      await mod.onConfirmation(
        {},
        {
          returnMessage: () => ({ module: 'Registry', identifier })
        },
        0
      );
      expect(mod.app.crypto.signMessage).not.toHaveBeenCalled();
      expect(mod.app.storage.runDatabase).not.toHaveBeenCalled();
    }
  );

  test('bounds the full identifier including its domain', () => {
    expect(isRegistrationIdentifier('a@' + 'b'.repeat(253))).toBe(true);
    expect(isRegistrationIdentifier('a@' + 'b'.repeat(254))).toBe(false);
  });

  test('new databases enforce 255 characters on inserts and updates', async () => {
    await db.exec(schema);
    await db.run('INSERT INTO records (identifier) VALUES (?)', 'a'.repeat(255));
    await expect(
      db.run('INSERT OR IGNORE INTO records (identifier) VALUES (?)', 'b'.repeat(256))
    ).rejects.toThrow('255');
    await expect(db.run('UPDATE records SET identifier = ?', 'c'.repeat(256))).rejects.toThrow(
      '255'
    );
  });

  test('startup upgrades existing databases without changing signed records', async () => {
    await db.exec(schema.split('-- SQLite')[0].replace(' CHECK (length(identifier) <= 255)', ''));
    const longName = 'a'.repeat(10000) + '@saito';
    await db.run(
      'INSERT INTO records (identifier, publickey, sig) VALUES (?, ?, ?)',
      longName,
      'LegacyKey',
      'original-signature'
    );
    const mod = registry(db);
    await mod.initialize(mod.app);
    await mod.initialize(mod.app);
    expect(await db.get('SELECT identifier, sig FROM records')).toEqual({
      identifier: longName,
      sig: 'original-signature'
    });
    await expect(
      db.run('INSERT INTO records (identifier) VALUES (?)', 'b'.repeat(256))
    ).rejects.toThrow('255');
    await expect(db.run('UPDATE records SET identifier = ?', 'c'.repeat(256))).rejects.toThrow(
      '255'
    );
    await db.run('UPDATE records SET lc = 0');
    await db.run(
      'INSERT INTO records (identifier, publickey) VALUES (?, ?)',
      'normal@saito',
      'NormalKey'
    );
    const callback = jest.fn();
    await mod.fetchIdentifiersFromDatabase(['LegacyKey', 'NormalKey'], callback);
    expect(callback).toHaveBeenCalledWith({ NormalKey: 'normal@saito' });
    expect(mod.cached_keys.LegacyKey).toBeUndefined();
  });

  test('direct record writes reject oversized identifiers', async () => {
    const mod = registry(db);
    expect(await mod.addRecord('a'.repeat(256))).toBe(0);
    expect(mod.app.storage.runDatabase).not.toHaveBeenCalled();
  });

  test('oversized confirmation emails never reach verification or the keychain', async () => {
    const mod = registry(db);
    await mod.onConfirmation(
      {},
      {
        returnMessage: () => ({ module: 'Email', identifier: 'a'.repeat(256) })
      },
      0
    );
    expect(mod.app.crypto.verifyMessage).not.toHaveBeenCalled();
  });

  test('filters oversized identifiers returned by older peers', () => {
    const mod = registry(db);
    mod.app.network.sendRequestAsTransaction.mockImplementation((request, data, callback) => {
      callback({ NormalKey: 'normal@saito', LegacyKey: 'a'.repeat(256) });
    });
    const callback = jest.fn();
    mod.queryKeys({ publicKey: 'PeerKey' }, ['NormalKey', 'LegacyKey'], callback);
    expect(callback).toHaveBeenCalledWith({ NormalKey: 'normal@saito' });
  });

  test('overlay rejects 65 characters before querying availability or showing its loader', () => {
    const RegisterUsername = jest.requireActual('../../../mods/registry/lib/register-username');
    const mod = registry(db);
    const input = { value: 'a'.repeat(65) + '@saito', select: jest.fn() };
    const submit = {};
    const overlay = Object.create(RegisterUsername.prototype);
    overlay.app = mod.app;
    overlay.mod = mod;
    overlay.loader = { render: jest.fn() };
    global.document = {
      querySelector: (selector) => (selector === '#saito-overlay-form-input' ? input : submit),
      getElementById: () => ({})
    };
    global.salert = jest.fn();
    try {
      overlay.attachEvents();
      submit.onclick({ preventDefault() {} });
      expect(global.salert).toHaveBeenCalledWith('Username must be 64 characters or fewer');
      expect(mod.app.network.sendRequestAsTransaction).not.toHaveBeenCalled();
      expect(overlay.loader.render).not.toHaveBeenCalled();
    } finally {
      delete global.document;
      delete global.salert;
    }
  });
});
