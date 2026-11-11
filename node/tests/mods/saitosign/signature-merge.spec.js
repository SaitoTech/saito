const assert = require('node:assert/strict');
const { createHash } = require('crypto');
const test = require('node:test');
const {
  addSignature,
  emailVerificationMessage,
  finalizeDocument
} = require('../../../mods/saitosign/lib/auth');
const {
  DOCUMENT_MISMATCH,
  IDENTITY_MISSING,
  PUBLIC_KEY_MISMATCH,
  SIGNATURE_CONFLICT,
  SIGNATURE_INVALID,
  commitCanonicalMerge,
  mergeSignatureRecords,
  uploaderKey
} = require('../../../mods/saitosign/lib/signature-merge');

const SERVER = 'server-key';

function app() {
  return {
    crypto: {
      hash(value) {
        return createHash('sha256').update(String(value)).digest('hex');
      },
      signMessage(message, privateKey) {
        return `sig:${privateKey}:${message}`;
      },
      verifyMessage(message, signature, publicKey) {
        return signature === `sig:${publicKey}:${message}`;
      },
      verifySignature(buffer, signature, publicKey) {
        return signature === `tx:${publicKey}:${Buffer.from(buffer).toString('hex')}`;
      }
    },
    wallet: {
      getPrivateKey: async () => 'creator-key'
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function baseDocument(cryptoApp) {
  const record = {
    document: {
      name: 'Agreement.pdf',
      pdf: [{
        name: 'Agreement.pdf',
        pdf: Buffer.from('%PDF-1.4\n').toString('base64'),
        page_count: 1,
        page_width: 612,
        page_height: 792
      }],
      page_count: 1,
      page_width: 612,
      page_height: 792
    },
    users: [
      { name: 'Ada', email: 'ada@example.com', publickey: '', verifications: [], signatures: [] },
      { name: 'Bea', email: 'bea@example.com', publickey: '', verifications: [], signatures: [] },
      { name: 'Cam', email: 'cam@example.com', publickey: '', verifications: [], signatures: [] }
    ],
    actions: [
      { id: 1, type: 'signature', user: 0, page: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.08 },
      { id: 2, type: 'signature', user: 1, page: 1, x: 0.1, y: 0.3, width: 0.3, height: 0.08 },
      { id: 3, type: 'signature', user: 2, page: 1, x: 0.1, y: 0.5, width: 0.3, height: 0.08 }
    ],
    creator: 'creator-key',
    metadata: { tier: 'free', tier_owner: '', verification: { email: true, phone: false, photo: false, passport: false, legal_review: false } }
  };
  assert.equal(await finalizeDocument(cryptoApp, record, 'creator-key'), true);
  return record;
}

function authorize(cryptoApp, record, index, key) {
  const user = record.users[index];
  user.publickey = key;
  const message = emailVerificationMessage(user.email, key);
  user.verifications = [{
    method: 'email',
    publickey: SERVER,
    message,
    signature: cryptoApp.crypto.signMessage(message, SERVER)
  }];
}

function signSlot(cryptoApp, record, index, key) {
  const user = record.users[index];
  const additions = record.actions
    .filter((action) => action.user === index)
    .map((action) => addSignature(cryptoApp, action, key, record.hash));
  user.signatures = additions;
}

function signedCopy(cryptoApp, source, index, key) {
  const copy = clone(source);
  authorize(cryptoApp, copy, index, key);
  signSlot(cryptoApp, copy, index, key);
  return copy;
}

function merge(cryptoApp, canonical, submitted, key) {
  return mergeSignatureRecords(cryptoApp, canonical, submitted, key, SERVER);
}

function txFor(cryptoApp, key) {
  const hash = new Uint8Array([9, 8, 7]);
  return {
    signature: `tx:${key}:${Buffer.from(hash).toString('hex')}`,
    from: [{ publicKey: key }],
    generateHashForSignature() {},
    getHashForSignature() {
      return hash;
    }
  };
}

function signatureIds(record) {
  return record.users.map((user) => (user.signatures || []).map((entry) => entry.id));
}

test('A then B and B then A both keep every signature', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const fromA = signedCopy(cryptoApp, original, 0, 'user-a');
  const fromB = signedCopy(cryptoApp, original, 1, 'user-b');

  const first = merge(cryptoApp, original, fromA, 'user-a');
  const second = merge(cryptoApp, first.record, fromB, 'user-b');
  const reverseFirst = merge(cryptoApp, original, fromB, 'user-b');
  const reverseSecond = merge(cryptoApp, reverseFirst.record, fromA, 'user-a');

  assert.equal(second.ok, true);
  assert.equal(reverseSecond.ok, true);
  assert.deepEqual(signatureIds(second.record), [[1], [2], []]);
  assert.deepEqual(signatureIds(reverseSecond.record), [[1], [2], []]);
  assert.equal(second.record.hash, original.hash);
  assert.deepEqual(second.record.finalization, original.finalization);
  assert.deepEqual(second.record.creatorProof, original.creatorProof);
  assert.equal(reverseSecond.record.hash, original.hash);
  assert.deepEqual(reverseSecond.record.finalization, original.finalization);
  assert.deepEqual(reverseSecond.record.creatorProof, original.creatorProof);
});

test('a duplicate signature is already present and does not add another record', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const fromA = signedCopy(cryptoApp, original, 0, 'user-a');
  const saved = merge(cryptoApp, original, fromA, 'user-a');
  const again = merge(cryptoApp, saved.record, fromA, 'user-a');
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.deepEqual(again.added, []);
  assert.equal(again.record.users[0].signatures.length, 1);
});

test('a conflicting or invalid signature and a different document leave the canonical copy unchanged', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const fromA = signedCopy(cryptoApp, original, 0, 'user-a');
  const saved = merge(cryptoApp, original, fromA, 'user-a').record;
  const before = clone(saved);

  const conflict = signedCopy(cryptoApp, original, 0, 'user-a');
  conflict.users[0].signatures[0].signature = 'sig:user-a:different';
  const conflicted = merge(cryptoApp, saved, conflict, 'user-a');
  assert.equal(conflicted.error, SIGNATURE_CONFLICT);
  assert.deepEqual(saved, before);

  const invalid = signedCopy(cryptoApp, original, 1, 'user-b');
  invalid.users[1].signatures[0].signature = 'sig:user-b:not-the-field';
  const rejected = merge(cryptoApp, saved, invalid, 'user-b');
  assert.equal(rejected.error, SIGNATURE_INVALID);
  assert.deepEqual(saved, before);

  const otherPdf = clone(fromA);
  otherPdf.document.pdf[0].pdf = Buffer.from('%PDF-other').toString('base64');
  assert.equal(merge(cryptoApp, saved, otherPdf, 'user-a').error, DOCUMENT_MISMATCH);

  const otherHash = clone(fromA);
  otherHash.hash = 'different-commitment';
  assert.equal(merge(cryptoApp, saved, otherHash, 'user-a').error, DOCUMENT_MISMATCH);

  const moved = clone(fromA);
  moved.actions[0].x = 0.5;
  assert.equal(merge(cryptoApp, saved, moved, 'user-a').error, DOCUMENT_MISMATCH);
  assert.deepEqual(saved, before);
});

test('a submission that omits an existing signature does not remove it', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const withA = merge(cryptoApp, original, signedCopy(cryptoApp, original, 0, 'user-a'), 'user-a').record;
  const onlyB = signedCopy(cryptoApp, original, 1, 'user-b');
  const merged = merge(cryptoApp, withA, onlyB, 'user-b');
  assert.deepEqual(signatureIds(merged.record), [[1], [2], []]);
});

test('only the email-authorized public key can add that signer slot', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const before = clone(original);
  const fromA = signedCopy(cryptoApp, original, 0, 'user-a');

  const authed = uploaderKey(cryptoApp, txFor(cryptoApp, 'user-a'));
  assert.equal(authed.ok, true);
  assert.equal(merge(cryptoApp, original, fromA, authed.publicKey).ok, true);

  const stranger = uploaderKey(cryptoApp, txFor(cryptoApp, 'stranger'));
  assert.equal(stranger.ok, true);
  const denied = merge(cryptoApp, original, fromA, stranger.publicKey);
  assert.equal(denied.error, PUBLIC_KEY_MISMATCH);
  assert.deepEqual(original, before);

  const behalf = signedCopy(cryptoApp, original, 1, 'user-b');
  behalf.users[0] = clone(fromA.users[0]);
  const wrongSlot = merge(cryptoApp, original, behalf, 'user-a');
  assert.equal(wrongSlot.error, PUBLIC_KEY_MISMATCH);
  assert.deepEqual(original, before);

  const missing = clone(fromA);
  missing.users[0].verifications = [];
  assert.equal(merge(cryptoApp, original, missing, 'user-a').error, IDENTITY_MISSING);

  const forged = clone(fromA);
  forged.users[0].verifications[0].signature = 'sig:server-key:nope';
  assert.equal(merge(cryptoApp, original, forged, 'user-a').error, IDENTITY_MISSING);
  assert.deepEqual(original, before);

  const unsigned = uploaderKey(cryptoApp, { signature: '', from: [{ publicKey: 'user-a' }], getHashForSignature() { return new Uint8Array(); } });
  assert.equal(unsigned.ok, false);
});

test('concurrent uploads from the same downloaded version merge in either arrival order', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const submissions = [
    signedCopy(cryptoApp, original, 0, 'user-a'),
    signedCopy(cryptoApp, original, 1, 'user-b'),
    signedCopy(cryptoApp, original, 2, 'user-c')
  ];
  const keys = ['user-a', 'user-b', 'user-c'];
  let version = { record: clone(original), storageHash: 'h0' };
  let chain = Promise.resolve();
  const writes = [];

  function writeCanonical(packed, expectedHash) {
    const run = chain.then(async () => {
      if (version.storageHash !== expectedHash) {
        const err = new Error('conflict');
        err.code = 'conflict';
        throw err;
      }
      version = {
        record: packed.record,
        storageHash: `h${writes.length + 1}`
      };
      writes.push({ expectedHash, storageHash: version.storageHash, expires: true });
      return { document_hash: version.storageHash };
    });
    chain = run.catch(() => {});
    return run;
  }

  const results = await Promise.all(submissions.map((submitted, index) => commitCanonicalMerge({
    app: cryptoApp,
    signerKey: keys[index],
    serverKey: SERVER,
    submitted,
    readCanonical: async () => ({ record: clone(version.record), storageHash: version.storageHash }),
    writeCanonical,
    buildArchive: async (record) => ({ record: clone(record) })
  })));

  assert.equal(results.every((result) => result.ok && result.stored), true);
  assert.deepEqual(signatureIds(version.record), [[1], [2], [3]]);
  assert.equal(version.record.hash, original.hash);
  assert.deepEqual(version.record.finalization, original.finalization);
  assert.deepEqual(version.record.creatorProof, original.creatorProof);
  assert.equal(writes.length, 3);

  const duplicate = await commitCanonicalMerge({
    app: cryptoApp,
    signerKey: 'user-a',
    serverKey: SERVER,
    submitted: submissions[0],
    readCanonical: async () => ({ record: clone(version.record), storageHash: version.storageHash }),
    writeCanonical,
    buildArchive: async (record) => ({ record: clone(record) })
  });
  assert.equal(duplicate.stored, false);
  assert.equal(writes.length, 3);
});
