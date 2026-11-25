const assert = require('node:assert/strict');
const { createHash } = require('crypto');
const test = require('node:test');
const { copy, hydrate } = require('../../../mods/saitosign/lib/document');
const { encryptPackage, decryptPackage } = require('../../../mods/saitosign/lib/envelope');
const SaitoSignDatabase = require('../../../mods/saitosign/lib/database');
const { retentionExpiry, SHARE_RETENTION_MS } = require('../../../mods/saitosign/lib/share-protocol');
const {
  addInitial,
  addSignature,
  collectedSignatures,
  contractDocuments,
  createServerFinalization,
  emailVerificationMessage,
  finalizeDocument,
  serverFinalizationMessage,
  serverFinalizationReady,
  verifyPhoto,
  verifyServerAttestation
} = require('../../../mods/saitosign/lib/auth');
const {
  FINALIZED_LOCKED,
  INVALID_SERVER_FINALIZATION,
  commitCanonicalMerge,
  mergeSignatureRecords
} = require('../../../mods/saitosign/lib/signature-merge');

const SERVER = 'server-key';

function app() {
  let signingKey = 'creator-key';
  return {
    signingKey(next) {
      signingKey = next;
    },
    crypto: {
      hash(value) {
        return createHash('sha256').update(String(value)).digest('hex');
      },
      signMessage(message, privateKey) {
        return `sig:${privateKey}:${message}`;
      },
      verifyMessage(message, signature, publicKey) {
        return signature === `sig:${publicKey}:${message}`;
      }
    },
    wallet: {
      getPrivateKey: async () => signingKey
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
      }, {
        name: 'Exhibit.pdf',
        pdf: Buffer.from('%PDF-1.4\nexhibit').toString('base64'),
        page_count: 1,
        page_width: 612,
        page_height: 792
      }],
      page_count: 2,
      page_width: 612,
      page_height: 792
    },
    users: [
      { name: 'Ada', email: 'ada@example.com', publickey: '', verifications: [], signatures: [] },
      { name: 'Bea', email: 'bea@example.com', publickey: '', verifications: [], signatures: [] }
    ],
    actions: [
      { id: 1, type: 'signature', user: 0, page: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.08 },
      { id: 2, type: 'initial', user: 1, page: 2, x: 0.2, y: 0.2, width: 0.2, height: 0.05 }
    ],
    creator: 'creator-key',
    metadata: {
      tier: 'free',
      tier_owner: '',
      verification: { email: true, phone: false, photo: false, passport: false, legal_review: false }
    }
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

async function addPhoto(cryptoApp, record, index, key) {
  cryptoApp.signingKey(key);
  const photo = await verifyPhoto(cryptoApp, key, 'data:image/png;base64,aaaa');
  cryptoApp.signingKey('creator-key');
  record.users[index].verifications.push(photo);
}

function signSlot(cryptoApp, record, index, key) {
  record.users[index].signatures = record.actions
    .filter((action) => action.user === index)
    .map((action) => (action.type === 'initial'
      ? addInitial(cryptoApp, action, key, record.hash)
      : addSignature(cryptoApp, action, key, record.hash)));
}

async function signedCopy(cryptoApp, source, index, key) {
  const next = clone(source);
  authorize(cryptoApp, next, index, key);
  if (index === 0) {
    await addPhoto(cryptoApp, next, index, key);
  }
  signSlot(cryptoApp, next, index, key);
  return next;
}

async function withBothSigners(cryptoApp, source) {
  const ada = await signedCopy(cryptoApp, source, 0, 'user-a');
  const bea = await signedCopy(cryptoApp, source, 1, 'user-b');
  const merged = mergeSignatureRecords(cryptoApp, ada, bea, 'user-b', SERVER);
  assert.equal(merged.ok, true);
  return merged.record;
}

test('an incomplete document is saved without a server finalization signature', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const partial = await signedCopy(cryptoApp, original, 0, 'user-a');
  const merged = mergeSignatureRecords(cryptoApp, original, partial, 'user-a', SERVER);
  assert.equal(merged.ok, true);
  assert.equal(merged.complete, false);
  assert.equal(serverFinalizationReady(cryptoApp, merged.record), false);
  cryptoApp.signingKey(SERVER);
  const result = await createServerFinalization(cryptoApp, merged.record, SERVER, Date.parse('2026-11-23T00:00:00.000Z'));
  assert.equal(result.created, false);
  assert.equal(result.incomplete, true);
  assert.equal(merged.record.serverFinalization, undefined);
});

test('the completing signature produces one verifiable finalization over every contract hash and signature', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const complete = await withBothSigners(cryptoApp, original);
  assert.equal(serverFinalizationReady(cryptoApp, complete), true);
  cryptoApp.signingKey(SERVER);
  const created = await createServerFinalization(cryptoApp, complete, SERVER, Date.parse('2026-11-23T00:00:00.000Z'));
  assert.equal(created.created, true);
  const proof = complete.serverFinalization;
  assert.equal(proof.version, 1);
  assert.equal(proof.publickey, SERVER);
  assert.equal(proof.finalized_at, '2026-11-23T00:00:00.000Z');
  assert.equal(proof.message, serverFinalizationMessage(cryptoApp, complete));
  assert.match(proof.message, /^Request received for finalization of documents .+ with signatures /);
  assert.equal(verifyServerAttestation(cryptoApp, complete, SERVER), true);

  const documents = contractDocuments(cryptoApp, complete);
  assert.deepEqual(documents.map((item) => item.kind).sort(), ['commitment', 'creator_contract', 'pdf', 'pdf', 'pdf_set'].sort());
  assert.equal(documents.filter((item) => item.kind === 'pdf').length, 2);
  documents.forEach((item) => assert.match(proof.message, new RegExp(item.hash)));

  const kinds = collectedSignatures(complete).map((item) => item.kind);
  assert.ok(kinds.includes('creator_finalization'));
  assert.ok(kinds.includes('creator_proof'));
  assert.ok(kinds.includes('email'));
  assert.ok(kinds.includes('photo'));
  assert.ok(kinds.includes('user_action'));
  assert.equal(kinds.filter((kind) => kind === 'email').length, 2);
  assert.equal(kinds.filter((kind) => kind === 'user_action').length, 2);
  assert.equal(proof.message.includes(proof.signature), false);

  const again = await createServerFinalization(cryptoApp, complete, SERVER, Date.parse('2026-11-24T00:00:00.000Z'));
  assert.equal(again.created, false);
  assert.equal(again.already, true);
  assert.equal(complete.serverFinalization.signature, proof.signature);
  assert.equal(complete.serverFinalization.finalized_at, proof.finalized_at);
});

test('changing any included signature or contract hash makes verification fail', async () => {
  const cryptoApp = app();
  const complete = await withBothSigners(cryptoApp, await baseDocument(cryptoApp));
  cryptoApp.signingKey(SERVER);
  await createServerFinalization(cryptoApp, complete, SERVER);
  const tampered = clone(complete);
  tampered.users[0].signatures[0].signature = 'sig:user-a:other';
  assert.equal(verifyServerAttestation(cryptoApp, tampered, SERVER), false);
  tampered.users[0].signatures[0].signature = complete.users[0].signatures[0].signature;
  tampered.users[0].verifications[0].signature = 'sig:server-key:other-email';
  assert.equal(verifyServerAttestation(cryptoApp, tampered, SERVER), false);
  const wrongServer = clone(complete);
  wrongServer.serverFinalization.publickey = 'other-server';
  assert.equal(verifyServerAttestation(cryptoApp, wrongServer, SERVER), false);
});

test('a finalized document rejects later signature changes and wallet restart', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const complete = await withBothSigners(cryptoApp, original);
  cryptoApp.signingKey(SERVER);
  await createServerFinalization(cryptoApp, complete, SERVER);
  const duplicate = await signedCopy(cryptoApp, original, 0, 'user-a');
  duplicate.users[1] = clone(complete.users[1]);
  const again = mergeSignatureRecords(cryptoApp, complete, duplicate, 'user-a', SERVER);
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(again.record.serverFinalization.signature, complete.serverFinalization.signature);

  const restarted = await signedCopy(cryptoApp, original, 0, 'user-a2');
  restarted.users[1] = clone(complete.users[1]);
  const blocked = mergeSignatureRecords(cryptoApp, complete, restarted, 'user-a2', SERVER, { restart: true });
  assert.equal(blocked.error, FINALIZED_LOCKED);
  assert.equal(complete.users[0].publickey, 'user-a');
  assert.equal(complete.serverFinalization.publickey, SERVER);

  const broken = clone(complete);
  broken.serverFinalization.signature = 'sig:server-key:not-the-message';
  const rejected = mergeSignatureRecords(cryptoApp, broken, duplicate, 'user-a', SERVER);
  assert.equal(rejected.error, INVALID_SERVER_FINALIZATION);
});

test('completion finalizes once, and a duplicate upload does not sign or extend retention', async () => {
  const cryptoApp = app();
  const original = await baseDocument(cryptoApp);
  const ada = await signedCopy(cryptoApp, original, 0, 'user-a');
  const bea = await signedCopy(cryptoApp, original, 1, 'user-b');
  let version = { record: clone(original), storageHash: 'h0' };
  const writes = [];
  const emails = [];

  async function upload(submitted, key) {
    return commitCanonicalMerge({
      app: cryptoApp,
      signerKey: key,
      serverKey: SERVER,
      submitted,
      readCanonical: async () => ({ record: clone(version.record), storageHash: version.storageHash }),
      finalize: (record) => {
        cryptoApp.signingKey(SERVER);
        return createServerFinalization(cryptoApp, record, SERVER, Date.parse('2026-11-23T12:00:00.000Z'));
      },
      buildArchive: async (record) => clone(record),
      writeCanonical: async (packed, expectedHash, meta) => {
        assert.equal(version.storageHash, expectedHash);
        const expiresAt = meta.finalizedNow
          ? retentionExpiry({
            mode: 'final',
            finalizedAt: meta.finalizedAt,
            retentionMs: SHARE_RETENTION_MS,
            now: Date.parse('2026-11-23T12:00:00.000Z')
          })
          : retentionExpiry({ mode: 'clear' });
        version = { record: packed, storageHash: `h${writes.length + 1}` };
        writes.push({ finalizedNow: meta.finalizedNow, expiresAt, signature: packed.serverFinalization?.signature || '' });
        if (meta.finalizedNow) {
          emails.push(packed.serverFinalization.signature);
        }
        return { document_hash: version.storageHash };
      }
    });
  }

  const first = await upload(ada, 'user-a');
  assert.equal(first.stored, true);
  assert.equal(first.finalizedNow, false);
  assert.equal(version.record.serverFinalization, undefined);
  assert.equal(writes[0].expiresAt, null);
  assert.equal(emails.length, 0);

  const second = await upload(bea, 'user-b');
  assert.equal(second.finalizedNow, true);
  assert.equal(verifyServerAttestation(cryptoApp, version.record, SERVER), true);
  assert.equal(writes.length, 2);
  assert.equal(emails.length, 1);
  const signature = version.record.serverFinalization.signature;
  const expiresAt = writes[1].expiresAt;
  assert.equal(expiresAt, Date.parse('2026-11-23T12:00:00.000Z') + SHARE_RETENTION_MS);

  const duplicate = await upload(ada, 'user-a');
  assert.equal(duplicate.stored, false);
  assert.equal(duplicate.finalizedNow, false);
  assert.equal(writes.length, 2);
  assert.equal(emails.length, 1);
  assert.equal(version.record.serverFinalization.signature, signature);
  assert.equal(version.record.serverFinalization.finalized_at, '2026-11-23T12:00:00.000Z');
  assert.equal(writes[1].expiresAt, expiresAt);
});

test('copy and hydrate keep server finalization, and older documents still open', async () => {
  const cryptoApp = app();
  const complete = await withBothSigners(cryptoApp, await baseDocument(cryptoApp));
  cryptoApp.signingKey(SERVER);
  await createServerFinalization(cryptoApp, complete, SERVER);
  const copied = copy(complete);
  assert.deepEqual(copied.serverFinalization, complete.serverFinalization);
  copied.users[0].signatures[0].signature = 'changed';
  assert.equal(complete.users[0].signatures[0].signature === 'changed', false);

  const saved = clone(copied);
  saved.document.pdf = [{ name: 'Agreement.pdf', pdf: Buffer.from('%PDF-1.4\n').toString('base64') }];
  const opened = await hydrate(saved);
  assert.deepEqual(opened.serverFinalization, complete.serverFinalization);

  const older = clone(complete);
  delete older.serverFinalization;
  const openedOlder = copy(older);
  assert.equal(openedOlder.serverFinalization, undefined);
  assert.equal(verifyServerAttestation(cryptoApp, openedOlder, SERVER), false);
});

test('encrypted processing decrypts in memory and a wrong password does not replace the stored document', async () => {
  const cryptoApp = app();
  const complete = await withBothSigners(cryptoApp, await baseDocument(cryptoApp));
  cryptoApp.signingKey(SERVER);
  await createServerFinalization(cryptoApp, complete, SERVER);
  const stored = await encryptPackage(JSON.stringify(complete), 'correct-password');
  const unlocked = JSON.parse(await decryptPackage(stored, 'correct-password'));
  assert.equal(verifyServerAttestation(cryptoApp, unlocked, SERVER), true);
  await assert.rejects(
    () => decryptPackage(stored, 'wrong-password'),
    (err) => err.code === 'password'
  );
  const kept = stored;
  let replaced = false;
  try {
    await decryptPackage(kept, 'wrong-password');
    replaced = true;
  } catch (err) {
    assert.equal(err.code, 'password');
  }
  assert.equal(replaced, false);
  assert.equal(kept, stored);
  const still = JSON.parse(await decryptPackage(stored, 'correct-password'));
  assert.equal(still.serverFinalization.signature, complete.serverFinalization.signature);
});

test('expired finalized documents are deleted and an open collection window is not', async () => {
  const expiredId = 'a'.repeat(32);
  const calls = [];
  const db = Object.create(SaitoSignDatabase.prototype);
  db.listExpiredDocuments = async () => [{ document_id: expiredId }];
  db.run = async (sql, params) => {
    calls.push({ sql, id: params.$document_id });
  };
  const removed = await db.deleteExpiredDocuments();
  assert.equal(removed, 1);
  assert.deepEqual(calls.map((call) => call.sql), [
    'DELETE FROM satosign_shares WHERE document_id = $document_id',
    'DELETE FROM satosign_documents WHERE document_id = $document_id'
  ]);
  assert.equal(calls[0].id, expiredId);
  const open = retentionExpiry({ mode: 'clear' });
  assert.equal(open, null);
  const closed = retentionExpiry({
    mode: 'final',
    finalizedAt: '2026-11-23T12:00:00.000Z',
    retentionMs: SHARE_RETENTION_MS
  });
  assert.equal(closed - Date.parse('2026-11-23T12:00:00.000Z'), 2 * 24 * 60 * 60 * 1000);
});
