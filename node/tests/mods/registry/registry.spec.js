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

  test('accepts 51 total characters and rejects 52 before creating a transaction', async () => {
    const mod = registry(db);
    await expect(mod.tryRegisterIdentifier('a'.repeat(46))).rejects.toThrow('51');
    expect(mod.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
    await expect(mod.tryRegisterIdentifier('a'.repeat(45))).resolves.toBe(true);
    const tx = mod.app.network.propagateTransaction.mock.calls[0][0];
    expect(tx.msg.identifier).toBe('a'.repeat(45) + '@saito');
    expect(tx.sign).toHaveBeenCalledTimes(1);
  });

  test.each(['', 'a b', 'a_b', '<script>', null, 123])('rejects invalid registration input %p', async (name) => {
    const mod = registry(db);
    await expect(mod.tryRegisterIdentifier(name)).rejects.toThrow();
    expect(mod.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
  });

  test.each(['a'.repeat(46) + '@saito', 'a'.repeat(1000000), '', 'a', '@saito', 'a@', 'a@@saito', 'a_b@saito', null, {}])(
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

  test.each(['a'.repeat(45) + '@saito', 'a'.repeat(49) + '@x', 'a@' + 'b'.repeat(49)])(
    'registers an incoming 51-character identifier %s', async (identifier) => {
      const mod = registry(db);
      const reply = { msg: {}, sign: jest.fn() };
      mod.app.wallet.getPrivateKey = jest.fn().mockResolvedValue('RegistryPrivateKey');
      mod.app.wallet.createUnsignedTransaction = jest.fn().mockResolvedValue(reply);
      mod.addRecord = jest.fn().mockResolvedValue(1);

      await mod.onConfirmation(
        { id: 1, hash: 'BlockHash' },
        {
          returnMessage: () => ({ module: 'Registry', identifier }),
          from: [{ publicKey: 'UserKey' }],
          isTo: (publicKey) => publicKey === mod.publicKey
        },
        0
      );

      expect(mod.app.crypto.signMessage).toHaveBeenCalledTimes(1);
      expect(mod.addRecord.mock.calls[0][0]).toBe(identifier);
      expect(reply.msg.identifier).toBe(identifier);
      expect(reply.msg.title).toBe('Address Registration Success!');
      expect(mod.app.network.propagateTransaction).toHaveBeenCalledWith(reply);
    }
  );

  test.each([['a'.repeat(49), '@x'], ['a', '@' + 'b'.repeat(49)]])(
    'counts the complete identifier for a custom domain', async (name, domain) => {
      const mod = registry(db);
      await expect(mod.tryRegisterIdentifier(name + 'a', domain)).rejects.toThrow('51');
      expect(mod.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
      await expect(mod.tryRegisterIdentifier(name, domain)).resolves.toBe(true);
      expect(mod.app.network.propagateTransaction.mock.calls[0][0].msg.identifier).toBe(name + domain);
    }
  );

  test('databases preserve identifiers longer than 255 characters on inserts and updates', async () => {
    await db.exec(schema);
    const identifier = 'a'.repeat(256) + '@saito';
    await db.run('INSERT OR IGNORE INTO records (identifier) VALUES (?)', identifier);
    expect(await db.get('SELECT identifier FROM records')).toEqual({ identifier });

    const updatedIdentifier = 'b'.repeat(10000) + '@saito';
    await db.run('UPDATE records SET identifier = ?', updatedIdentifier);
    expect(await db.get('SELECT identifier FROM records')).toEqual({
      identifier: updatedIdentifier
    });
  });

  test('startup preserves long signed records and allows subsequent long record writes', async () => {
    await db.exec(schema);
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
    await db.run('INSERT INTO records (identifier) VALUES (?)', 'b'.repeat(256));
    await db.run('UPDATE records SET identifier = ? WHERE identifier = ?', [
      'c'.repeat(256),
      'b'.repeat(256)
    ]);
    expect(await db.get('SELECT identifier FROM records WHERE identifier = ?', 'c'.repeat(256)))
      .toEqual({ identifier: 'c'.repeat(256) });
    expect(await db.get('SELECT identifier, sig FROM records WHERE publickey = ?', 'LegacyKey'))
      .toEqual({ identifier: longName, sig: 'original-signature' });
  });

  test.each([50, 51, 52, 10000])('caps database lookup results of length %i at 51 characters', async (length) => {
    await db.exec(schema);
    const prefix = 'abcdefghijklmnopqrstuvwxyz0123456789ABC';
    const storedIdentifier = prefix + 'x'.repeat(length - prefix.length - 6) + '@saito';
    const expectedIdentifier = length <= 51 ? storedIdentifier : storedIdentifier.substring(0, 51);
    await db.run(
      'INSERT INTO records (identifier, publickey, sig) VALUES (?, ?, ?)',
      storedIdentifier,
      'LegacyKey',
      'original-signature'
    );
    await db.run('UPDATE records SET lc = 0');
    await db.run(
      'INSERT INTO records (identifier, publickey) VALUES (?, ?)',
      'normal@saito',
      'NormalKey'
    );
    const mod = registry(db);
    const callback = jest.fn();
    await mod.fetchIdentifiersFromDatabase(['LegacyKey', 'NormalKey'], callback);
    expect(callback).toHaveBeenCalledWith({
      NormalKey: 'normal@saito',
      LegacyKey: expectedIdentifier
    });
    expect(mod.cached_keys.LegacyKey).toBe(expectedIdentifier);
    expect(mod.cached_keys.NormalKey).toBe('normal@saito');
    expect(await db.get('SELECT identifier, sig FROM records WHERE publickey = ?', 'LegacyKey'))
      .toEqual({ identifier: storedIdentifier, sig: 'original-signature' });
  });

  test('caps identifiers returned through the database lookup peer fallback at 51 characters', async () => {
    await db.exec(schema);
    const mod = registry(db);
    mod.publicKey = 'LocalKey';
    mod.peers = [{ publicKey: mod.registry_publickey }];
    mod.queryKeys = jest.fn((peer, keys, callback) => {
      callback({ LegacyKey: 'a'.repeat(46) + '@saito', NormalKey: 'normal@saito' });
    });
    const callback = jest.fn();

    await mod.fetchIdentifiersFromDatabase(['LegacyKey', 'NormalKey'], callback);

    const expected = { LegacyKey: 'a'.repeat(46) + '@sait', NormalKey: 'normal@saito' };
    expect(callback).toHaveBeenCalledWith(expected);
    expect(mod.cached_keys).toEqual(expected);
  });

  test('direct record writes preserve identifiers longer than 255 characters', async () => {
    await db.exec(schema);
    const mod = registry(db);
    const identifier = 'a'.repeat(256) + '@saito';
    expect(await mod.addRecord(identifier)).toBe(1);
    expect(await db.get('SELECT identifier FROM records')).toEqual({ identifier });
  });

  test.each([50, 51, 52, 256])('caps peer identifiers of length %i at 51 characters', (length) => {
    const mod = registry(db);
    const identifier = 'a'.repeat(length - 6) + '@saito';
    const missingKey = 'M'.repeat(60);
    const response = { NormalKey: 'normal@saito', LegacyKey: identifier, [missingKey]: missingKey };
    mod.app.network.sendRequestAsTransaction.mockImplementation((request, data, callback) => {
      callback(response);
    });
    const callback = jest.fn();
    mod.queryKeys({ publicKey: 'PeerKey' }, ['NormalKey', 'LegacyKey', missingKey], callback);
    expect(callback).toHaveBeenCalledWith({
      NormalKey: 'normal@saito',
      LegacyKey: length <= 51 ? identifier : identifier.substring(0, 51),
      [missingKey]: missingKey
    });
    expect(response.LegacyKey).toBe(identifier);
  });

  test('overlay displays the registry length error and restores the form', async () => {
    const RegisterUsername = jest.requireActual('../../../mods/registry/lib/register-username');
    const mod = registry(db);
    const input = { value: 'a'.repeat(46) + '@saito', select: jest.fn(), remove: jest.fn() };
    const submit = {};
    const overlay = Object.create(RegisterUsername.prototype);
    overlay.app = mod.app;
    overlay.mod = mod;
    overlay.loader = { render: jest.fn() };
    overlay.render = jest.fn();
    const element = { classList: { add: jest.fn() }, remove: jest.fn() };
    mod.app.browser = { addElementToId: jest.fn() };
    global.document = {
      querySelector: (selector) => {
        if (selector === '#saito-overlay-form-input') return input;
        if (selector === '.saito-overlay-form-submit') return submit;
        return element;
      },
      getElementById: () => ({})
    };
    global.salert = jest.fn();
    try {
      overlay.attachEvents();
      submit.onclick({ preventDefault() {} });
      const callback = mod.app.network.sendRequestAsTransaction.mock.calls[0][2];
      await callback([]);
      expect(global.salert).toHaveBeenCalledWith('Identifier must be 51 characters or fewer, including the domain');
      expect(mod.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
      expect(mod.app.network.propagateTransaction).not.toHaveBeenCalled();
      expect(overlay.render).toHaveBeenCalledTimes(1);
    } finally {
      delete global.document;
      delete global.salert;
    }
  });
});
