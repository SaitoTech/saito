#!/usr/bin/env node
'use strict';

// Copy legacy Mixin and BuySaito account credentials and deposit addresses
// into a new Mixin database. Purchase history and migration activity are not
// imported. Source files are opened read-only.

const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const Accounts = require('../lib/accounts');
const Database = require('../lib/database');

const SCRIPT_DIR = __dirname;
const SCHEMA_DIR = path.join(SCRIPT_DIR, '../sql');
const MODS_DIR = path.join(SCRIPT_DIR, '../..');

const CREDENTIAL_FIELDS = [
  'user_id',
  'session_id',
  'tip_key_base64',
  'pin_token_base64',
  'session_seed',
  'session_private_key',
  'spend_private_key',
  'spend_public_key'
];

class MigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationError';
  }
}

function parseArgs(argv) {
  const args = {
    input: path.join(SCRIPT_DIR, 'old'),
    output: path.join(SCRIPT_DIR, 'mixin.sq3'),
    overwrite: false,
    crypto: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--overwrite') {
      args.overwrite = true;
    } else if (arg === '--input') {
      args.input = path.resolve(argv[++i] || '');
    } else if (arg === '--output') {
      args.output = path.resolve(argv[++i] || '');
    } else {
      throw new MigrationError(`Unknown argument: ${arg}`);
    }
  }
  if (!args.input || !args.output) {
    throw new MigrationError('Missing a path after --input or --output.');
  }
  return args;
}

function usage() {
  return `Usage: node node/mods/mixin/scripts/migrate-legacy-databases.js [--input DIR] [--output FILE] [--overwrite]

Reads legacy backups from DIR (default: node/mods/mixin/scripts/old/) and writes
a new Mixin database to FILE (default: node/mods/mixin/scripts/mixin.sq3).

Expected files in the input directory:
  options        server options file (config/options)
  mixin.sq3      legacy Mixin database
  buysaito.sq3   legacy BuySaito database
  migration.sq3  legacy Migration database (inspected, payment rows are not imported)

If options.wallet.privateKey is encrypted, set SAITO_PASS to the password that
encrypted it. The options file is not modified.`;
}

function loadApplicationCrypto() {
  const ts = require('typescript');
  const sourcePath = path.join(SCRIPT_DIR, '../../../lib/saito/crypto.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: sourcePath
  });
  const Module = require('node:module');
  const loaded = new Module(sourcePath);
  loaded.filename = sourcePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  loaded._compile(compiled.outputText, sourcePath);
  const Crypto = loaded.exports.default || loaded.exports;
  return new Crypto({});
}

function isHexPrivateKey(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value);
}

// Same wallet-key unwrap as StorageCore.decryptWalletPrivateKey. Operates on a
// copy so the options file is never rewritten.
function unlockWalletKey(crypto, options) {
  if (!options || !options.wallet) {
    throw new MigrationError('The options file has no wallet.');
  }
  for (const field of ['privateKey', 'privatekey']) {
    const stored = options.wallet[field];
    if (!stored || isHexPrivateKey(stored)) {
      continue;
    }
    if (typeof process.env.SAITO_PASS === 'undefined') {
      throw new MigrationError(
        `The wallet ${field} in the options file is encrypted, and SAITO_PASS is not set.`
      );
    }
    const secret = crypto.toBase58(
      crypto.stringToHex('BYTHEPRICKINGOFMYTHUMBSSOMETHINGWICKEDTHISWAYCOMES' + process.env.SAITO_PASS)
    );
    let decrypted = '';
    try {
      decrypted = crypto.aesDecrypt(stored, secret);
    } catch (err) {
      decrypted = '';
    }
    if (!isHexPrivateKey(decrypted)) {
      throw new MigrationError(
        `Could not decrypt the wallet ${field} in the options file. SAITO_PASS is most likely incorrect.`
      );
    }
    options.wallet[field] = decrypted;
  }
  const privateKey = options.wallet.privateKey || options.wallet.privatekey || '';
  const publicKey = String(options.wallet.publicKey || options.wallet.publickey || '').trim();
  if (!isHexPrivateKey(privateKey) || !publicKey) {
    throw new MigrationError('The options file does not contain a usable wallet key pair.');
  }
  return { privateKey, publicKey };
}

function assetCatalog() {
  const catalog = new Map();
  for (const entry of fs.readdirSync(MODS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const file = path.join(MODS_DIR, entry.name, `${entry.name}.js`);
    if (!fs.existsSync(file)) {
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('mixin-crypto')) {
      continue;
    }
    const ticker = text.match(/this\.ticker\s*=\s*'([^']+)'/);
    const asset = text.match(/this\.asset_id\s*=\s*'([^']+)'/);
    if (!ticker || !asset) {
      continue;
    }
    catalog.set(ticker[1], asset[1]);
  }
  if (!catalog.size) {
    throw new MigrationError('No Mixin asset modules were found to map tickers to asset ids.');
  }
  return catalog;
}

async function openReadOnly(file) {
  return open({
    filename: file,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY
  });
}

async function tableExists(db, name) {
  const row = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    name
  );
  return !!row;
}

async function readRows(db, name, sql) {
  if (!(await tableExists(db, name))) {
    return { present: false, rows: [] };
  }
  return { present: true, rows: await db.all(sql) };
}

function credentialProjection(value) {
  const projected = {};
  for (const field of CREDENTIAL_FIELDS) {
    projected[field] = String(value?.[field] || '');
  }
  return projected;
}

function sameCredentials(left, right) {
  const a = credentialProjection(left);
  const b = credentialProjection(right);
  return CREDENTIAL_FIELDS.every((field) => a[field] === b[field]) && a.user_id !== '';
}

async function createSchema(db) {
  const files = ['accounts.sql', 'addresses.sql', 'transfers.sql', 'treasury.sql'];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8');
    await db.exec(sql);
  }
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS transfers_treasury_request_uidx
      ON transfers (request_id)
      WHERE purpose = 'treasury-payout' AND request_id <> '';
    CREATE TABLE IF NOT EXISTS store_withdrawal_claims (
      transfer_uuid TEXT PRIMARY KEY,
      payment_uuid TEXT NOT NULL UNIQUE,
      request_id TEXT NOT NULL,
      withdrawal_transfer_id INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS store_withdrawal_request_uidx
      ON transfers (request_id)
      WHERE purpose = 'store-withdrawal' AND request_id <> '';
  `);
}

function rememberAccount(groups, record, summary) {
  const key = `${record.publicKey}\0${record.userId}`;
  const existing = groups.get(key);
  if (!existing) {
    groups.set(key, record);
    summary.accounts.imported += 1;
    return;
  }
  if (record.ciphertext === existing.ciphertext) {
    summary.accounts.deduplicated += 1;
    return;
  }
  if (record.plain && existing.plain && sameCredentials(record.plain, existing.plain)) {
    summary.accounts.deduplicated += 1;
    return;
  }
  throw new MigrationError(
    `Account ${record.publicKey} / ${record.userId || '(unknown user)'} has conflicting credential records (${existing.source} and ${record.source}).`
  );
}

function rememberAddress(groups, record, summary) {
  const key = `${record.mixinUserId}\0${record.assetId}`;
  const existing = groups.get(key);
  if (!existing) {
    groups.set(key, record);
    summary.addresses.imported += 1;
    return;
  }
  if (existing.address === record.address) {
    if (!existing.publicKey && record.publicKey) {
      existing.publicKey = record.publicKey;
    } else if (existing.publicKey && record.publicKey && existing.publicKey !== record.publicKey) {
      throw new MigrationError(
        `Deposit address ${record.mixinUserId} / ${record.assetId} is associated with two Saito keys.`
      );
    }
    summary.addresses.deduplicated += 1;
    return;
  }
  throw new MigrationError(
    `Mixin user ${record.mixinUserId} asset ${record.assetId} has conflicting deposit addresses (${existing.source} and ${record.source}).`
  );
}

async function migrateLegacyDatabases(options) {
  const input = options.input;
  const output = options.output;
  const crypto = options.crypto || loadApplicationCrypto();
  const accounts = new Accounts({ crypto, options: {} }, {});
  const files = {
    options: path.join(input, 'options'),
    mixin: path.join(input, 'mixin.sq3'),
    buysaito: path.join(input, 'buysaito.sq3'),
    migration: path.join(input, 'migration.sq3')
  };
  for (const [name, file] of Object.entries(files)) {
    if (!fs.existsSync(file)) {
      throw new MigrationError(`Missing ${name} input: ${file}`);
    }
  }
  if (fs.existsSync(output) && !options.overwrite) {
    throw new MigrationError(`Output already exists: ${output}. Pass --overwrite to replace it.`);
  }

  const storedOptions = JSON.parse(fs.readFileSync(files.options, 'utf8'));
  const workingOptions = JSON.parse(JSON.stringify(storedOptions));
  const wallet = unlockWalletKey(crypto, workingOptions);
  const assets = assetCatalog();
  const summary = {
    sources: Object.values(files),
    accounts: { examined: 0, imported: 0, deduplicated: 0, unresolved: 0 },
    addresses: { examined: 0, imported: 0, deduplicated: 0, unresolved: 0 },
    excluded: [
      'buysaito.purchases payment status, amounts, and payloads',
      'migration.migration and migration.auto_migration payment rows',
      'mixin.mixin_payment_addresses, mixin_payment_requests, and mixin_payment_receipts'
    ],
    output
  };

  const mixinDb = await openReadOnly(files.mixin);
  const buysaitoDb = await openReadOnly(files.buysaito);
  const migrationDb = await openReadOnly(files.migration);
  try {
    if (await tableExists(migrationDb, 'mixin_accounts')) {
      throw new MigrationError(
        'The Migration database contains mixin_accounts. Those credentials are not part of the known Migration schema, so they were not imported.'
      );
    }

    const legacyAccounts = await readRows(
      mixinDb,
      'mixin_accounts',
      `SELECT id, publickey, account_hash FROM mixin_accounts ORDER BY id ASC`
    );
    const altAccounts = await readRows(
      buysaitoDb,
      'mixin_accounts',
      `SELECT id, publickey, mixin_json FROM mixin_accounts ORDER BY id ASC`
    );
    const legacyUsers = await readRows(
      mixinDb,
      'mixin_users',
      `SELECT user_id, address, publickey, asset_id, created_at FROM mixin_users ORDER BY created_at ASC, rowid ASC`
    );
    const purchaseAddresses = await readRows(
      buysaitoDb,
      'purchases',
      `SELECT mixin_user_id, destination, ticker FROM purchases ORDER BY id ASC`
    );

    const accountGroups = new Map();
    const serverUserIds = new Set();

    const consumeServerBlob = (source, publicKey, ciphertext) => {
      let plain;
      try {
        plain = accounts.decryptCredentials(ciphertext, wallet.privateKey);
      } catch (err) {
        summary.accounts.unresolved += 1;
        throw new MigrationError(
          `${source} is encrypted to the server wallet but could not be decrypted.`
        );
      }
      const userId = String(plain?.user_id || '').trim();
      if (!userId) {
        summary.accounts.unresolved += 1;
        throw new MigrationError(`${source} decrypted without a Mixin user id.`);
      }
      serverUserIds.add(userId);
      rememberAccount(
        accountGroups,
        {
          publicKey,
          userId,
          ciphertext,
          plain,
          createdAt: 0,
          source
        },
        summary
      );
    };

    for (const row of legacyAccounts.rows) {
      summary.accounts.examined += 1;
      const publicKey = String(row.publickey || '').trim();
      const ciphertext = String(row.account_hash || '');
      if (!publicKey || !ciphertext) {
        summary.accounts.unresolved += 1;
        throw new MigrationError(`mixin.mixin_accounts id ${row.id} is missing a key or ciphertext.`);
      }
      if (publicKey === wallet.publicKey) {
        consumeServerBlob(`mixin.mixin_accounts id ${row.id}`, publicKey, ciphertext);
      } else {
        rememberAccount(
          accountGroups,
          {
            publicKey,
            userId: '',
            ciphertext,
            plain: null,
            createdAt: 0,
            source: `mixin.mixin_accounts id ${row.id}`
          },
          summary
        );
      }
    }

    for (const row of altAccounts.rows) {
      summary.accounts.examined += 1;
      const publicKey = String(row.publickey || '').trim();
      const ciphertext = String(row.mixin_json || '');
      if (!publicKey || !ciphertext) {
        summary.accounts.unresolved += 1;
        throw new MigrationError(`buysaito.mixin_accounts id ${row.id} is missing a key or ciphertext.`);
      }
      if (publicKey !== wallet.publicKey) {
        summary.accounts.unresolved += 1;
        throw new MigrationError(
          `buysaito.mixin_accounts id ${row.id} is not encrypted to the server wallet, so its Mixin user id cannot be recovered.`
        );
      }
      consumeServerBlob(`buysaito.mixin_accounts id ${row.id}`, publicKey, ciphertext);
    }

    const primary = workingOptions.mixin;
    if (primary && typeof primary === 'object' && !Array.isArray(primary) && String(primary.user_id || '').trim()) {
      summary.accounts.examined += 1;
      const userId = String(primary.user_id).trim();
      const existing = accountGroups.get(`${wallet.publicKey}\0${userId}`);
      if (existing) {
        if (!sameCredentials(existing.plain, primary)) {
          summary.accounts.unresolved += 1;
          throw new MigrationError(
            'options.mixin does not match the server credential backup for the same Mixin user.'
          );
        }
        summary.accounts.deduplicated += 1;
      } else {
        const ciphertext = accounts.encryptCredentials(primary, wallet.publicKey);
        const plain = accounts.decryptCredentials(ciphertext, wallet.privateKey);
        if (!sameCredentials(plain, primary)) {
          summary.accounts.unresolved += 1;
          throw new MigrationError('The primary account from options could not be encrypted and read back.');
        }
        serverUserIds.add(userId);
        rememberAccount(
          accountGroups,
          {
            publicKey: wallet.publicKey,
            userId,
            ciphertext,
            plain,
            createdAt: 0,
            source: 'options.mixin'
          },
          summary
        );
      }
    }

    const addressGroups = new Map();
    for (const row of legacyUsers.rows) {
      summary.addresses.examined += 1;
      const mixinUserId = String(row.user_id || '').trim();
      const assetId = String(row.asset_id || '').trim();
      const address = String(row.address || '').trim();
      if (!mixinUserId || !assetId || !address) {
        summary.addresses.unresolved += 1;
        throw new MigrationError('A mixin_users row is missing a user id, asset id, or address.');
      }
      rememberAddress(
        addressGroups,
        {
          mixinUserId,
          assetId,
          address,
          publicKey: String(row.publickey || '').trim(),
          createdAt: Number(row.created_at) || 0,
          source: 'mixin.mixin_users'
        },
        summary
      );
    }

    const cryptoOptions = workingOptions.crypto && typeof workingOptions.crypto === 'object' ? workingOptions.crypto : {};
    const primaryUserId = String(workingOptions.mixin?.user_id || '').trim();
    for (const [ticker, entry] of Object.entries(cryptoOptions)) {
      const address = String(entry?.address || '').trim();
      if (!address) {
        continue;
      }
      summary.addresses.examined += 1;
      const assetId = assets.get(ticker);
      if (!assetId) {
        summary.addresses.unresolved += 1;
        throw new MigrationError(`options.crypto.${ticker}.address has no Mixin asset id in the installed modules.`);
      }
      if (!primaryUserId) {
        summary.addresses.unresolved += 1;
        throw new MigrationError(`options.crypto.${ticker}.address cannot be associated because options.mixin has no user id.`);
      }
      rememberAddress(
        addressGroups,
        {
          mixinUserId: primaryUserId,
          assetId,
          address,
          publicKey: wallet.publicKey,
          createdAt: 0,
          source: `options.crypto.${ticker}`
        },
        summary
      );
    }

    for (const row of purchaseAddresses.rows) {
      const mixinUserId = String(row.mixin_user_id || '').trim();
      const address = String(row.destination || '').trim();
      const ticker = String(row.ticker || '').trim();
      if (!mixinUserId && !address) {
        continue;
      }
      summary.addresses.examined += 1;
      if (!mixinUserId || !address || !ticker) {
        summary.addresses.unresolved += 1;
        throw new MigrationError('A BuySaito purchase destination is missing a Mixin user, ticker, or address.');
      }
      const assetId = assets.get(ticker);
      if (!assetId) {
        summary.addresses.unresolved += 1;
        throw new MigrationError(`BuySaito ticker ${ticker} has no Mixin asset id in the installed modules.`);
      }
      if (!serverUserIds.has(mixinUserId)) {
        summary.addresses.unresolved += 1;
        throw new MigrationError(
          `BuySaito destination for Mixin user ${mixinUserId} has no imported server credentials.`
        );
      }
      rememberAddress(
        addressGroups,
        {
          mixinUserId,
          assetId,
          address,
          publicKey: wallet.publicKey,
          createdAt: 0,
          source: `buysaito.purchases ${ticker}`
        },
        summary
      );
    }

    const listed = Array.isArray(workingOptions.mixin?.deposit_addresses)
      ? workingOptions.mixin.deposit_addresses
      : [];
    for (const item of listed) {
      const address = String(item?.address || '').trim();
      const assetId = String(item?.asset_id || '').trim();
      const mixinUserId = String(item?.mixin_user_id || '').trim();
      if (!address && !assetId && !mixinUserId) {
        continue;
      }
      summary.addresses.examined += 1;
      if (!address || !assetId || !mixinUserId) {
        summary.addresses.unresolved += 1;
        throw new MigrationError('An options.mixin.deposit_addresses entry is incomplete.');
      }
      rememberAddress(
        addressGroups,
        {
          mixinUserId,
          assetId,
          address,
          publicKey: wallet.publicKey,
          createdAt: 0,
          source: 'options.mixin.deposit_addresses'
        },
        summary
      );
    }

    const temp = `${output}.partial`;
    if (fs.existsSync(temp)) {
      fs.rmSync(temp);
    }
    const out = await open({ filename: temp, driver: sqlite3.Database });
    try {
      await out.exec('BEGIN');
      await createSchema(out);
      const accountRows = [...accountGroups.values()].sort((a, b) =>
        `${a.publicKey}\0${a.userId}`.localeCompare(`${b.publicKey}\0${b.userId}`)
      );
      for (const row of accountRows) {
        await out.run(
          `INSERT INTO accounts (publickey, user_id, ciphertext, created_at) VALUES (?, ?, ?, ?)`,
          row.publicKey,
          row.userId,
          row.ciphertext,
          row.createdAt
        );
      }
      const addressRows = [...addressGroups.values()].sort((a, b) =>
        `${a.mixinUserId}\0${a.assetId}`.localeCompare(`${b.mixinUserId}\0${b.assetId}`)
      );
      for (const row of addressRows) {
        await out.run(
          `INSERT INTO addresses (mixin_user_id, publickey, asset_id, address, created_at) VALUES (?, ?, ?, ?, ?)`,
          row.mixinUserId,
          row.publicKey,
          row.assetId,
          row.address,
          row.createdAt
        );
      }
      await out.exec('COMMIT');
      await validateOutput(out, accounts, wallet, accountRows, addressRows);
    } catch (err) {
      try {
        await out.exec('ROLLBACK');
      } catch (rollbackErr) {
        // The transaction may already be committed or the handle may be closing.
      }
      throw err;
    } finally {
      await out.close();
    }

    if (fs.existsSync(output)) {
      fs.rmSync(output);
    }
    fs.renameSync(temp, output);
    summary.validation = 'passed';
    return summary;
  } finally {
    await mixinDb.close();
    await buysaitoDb.close();
    await migrationDb.close();
    const temp = `${output}.partial`;
    if (fs.existsSync(temp)) {
      fs.rmSync(temp);
    }
  }
}

async function validateOutput(db, accounts, wallet, accountRows, addressRows) {
  const integrity = await db.get('PRAGMA integrity_check');
  if (integrity?.integrity_check !== 'ok') {
    throw new MigrationError('SQLite integrity check failed.');
  }
  const required = [
    'accounts',
    'addresses',
    'transfers',
    'treasury',
    'store_withdrawal_claims'
  ];
  for (const name of required) {
    if (!(await tableExists(db, name))) {
      throw new MigrationError(`The new database is missing table ${name}.`);
    }
  }
  const indexes = await db.all(`SELECT name FROM sqlite_master WHERE type = 'index'`);
  const indexNames = new Set(indexes.map((row) => row.name));
  for (const name of ['accounts_publickey_user_uidx', 'addresses_wallet_asset_uidx', 'transfers_inbound_tx_hash_uidx']) {
    if (!indexNames.has(name)) {
      throw new MigrationError(`The new database is missing index ${name}.`);
    }
  }

  const storage = {
    queryDatabase(sql, params) {
      return db.all(sql, params);
    },
    runDatabase(sql, params) {
      return db.run(sql, params);
    },
    returnDatabaseByName() {
      return db;
    }
  };
  const database = new Database({ storage }, { dbname: 'mixin' });
  const transfers = await db.get('SELECT COUNT(*) AS count FROM transfers');
  if (Number(transfers?.count) !== 0) {
    throw new MigrationError('The new database contains transfer rows. Payment history is not migrated.');
  }

  for (const row of accountRows) {
    const found = await database.getCredentials(row.publicKey);
    const match = (found || []).find((item) => item.user_id === row.userId && item.ciphertext === row.ciphertext);
    if (!match) {
      throw new MigrationError(`Imported account ${row.publicKey} / ${row.userId || '(customer backup)'} is not returned by account lookup.`);
    }
    if (row.publicKey === wallet.publicKey) {
      const plain = accounts.decryptCredentials(match.ciphertext, wallet.privateKey);
      if (String(plain?.user_id || '') !== row.userId) {
        throw new MigrationError('A server account decrypted to a different Mixin user than the row that stores it.');
      }
    }
  }

  for (const row of addressRows) {
    const found = await database.findAddress({
      assetId: row.assetId,
      mixinUserId: row.mixinUserId,
      address: row.address
    });
    if (!found || found.address !== row.address || found.user_id !== row.mixinUserId) {
      throw new MigrationError(
        `Imported deposit address for ${row.mixinUserId} / ${row.assetId} is not returned by address lookup.`
      );
    }
  }
}

function printSummary(summary) {
  console.log('Legacy Mixin migration');
  console.log(`Sources: ${summary.sources.join(', ')}`);
  console.log(
    `Accounts: examined ${summary.accounts.examined}, imported ${summary.accounts.imported}, deduplicated ${summary.accounts.deduplicated}, unresolved ${summary.accounts.unresolved}`
  );
  console.log(
    `Addresses: examined ${summary.addresses.examined}, imported ${summary.addresses.imported}, deduplicated ${summary.addresses.deduplicated}, unresolved ${summary.addresses.unresolved}`
  );
  console.log(`Excluded: ${summary.excluded.join('; ')}`);
  console.log(`Validation: ${summary.validation}`);
  console.log(`Database: ${summary.output}`);
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const summary = await migrateLegacyDatabases(args);
  printSummary(summary);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    const message = err instanceof MigrationError ? err.message : err?.message || String(err);
    console.error(`Migration failed: ${message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  MigrationError,
  migrateLegacyDatabases,
  parseArgs,
  usage,
  loadApplicationCrypto,
  assetCatalog
};
