const assert = require('node:assert/strict');
const { createHash } = require('crypto');
const { finalizeDocument, signingConfigurationError } = require('../../../mods/saitosign/lib/auth');
const { shareMetadata } = require('../../../mods/saitosign/lib/transaction');
const { initialState, setShareOption, applyShareMetadata } = require('../../../mods/saitosign/lib/ui/overlays/publish.flow');
const selectSlide = require('../../../mods/saitosign/lib/ui/overlays/publish.select');
const { mergeSignatureRecords, EMAIL_REQUIRED } = require('../../../mods/saitosign/lib/signature-merge');
const { handleShareRequest } = require('../../../mods/saitosign/lib/share-server');

function cryptoApp() {
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
      }
    },
    wallet: {
      publicKey: 'creator-key',
      getPrivateKey: async () => 'creator-key'
    }
  };
}

function draft(email) {
  return {
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
      { name: 'Ada', email: 'ada@example.com', publickey: '', verifications: [], signatures: [] }
    ],
    actions: [
      { id: 1, type: 'signature', user: 0, page: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.08 }
    ],
    creator: 'creator-key',
    metadata: {
      tier: 'free',
      tier_owner: '',
      verification: { email, phone: false, photo: true, passport: false, legal_review: false }
    }
  };
}

test('email stays checked and the other verification methods stay optional', () => {
  const state = initialState();
  state.options.email = false;
  state.options.photo = false;
  state.options.passport = false;
  const slide = selectSlide(state);
  assert.match(slide.body, /data-share-option="email"[^>]*checked disabled/);
  assert.match(slide.body, /data-share-option="photo"/);
  assert.match(slide.body, /data-share-option="passport"/);
  assert.doesNotMatch(slide.body, /data-share-option="photo"[^>]*disabled/);
  assert.doesNotMatch(slide.body, /data-share-option="passport"[^>]*disabled/);

  const unchecked = setShareOption(state, 'email', false);
  assert.equal(unchecked.options.email, true);
  const photo = setShareOption(unchecked, 'photo', true);
  const passport = setShareOption(photo, 'passport', true);
  const cleared = setShareOption(passport, 'photo', false);
  assert.equal(cleared.options.email, true);
  assert.equal(cleared.options.photo, false);
  assert.equal(cleared.options.passport, true);
});

test('saved verification configuration always includes email', () => {
  const metadata = shareMetadata('free', { email: false, photo: true, passport: false });
  assert.equal(metadata.verification.email, true);
  assert.equal(metadata.verification.photo, true);
  assert.equal(metadata.verification.passport, false);

  const restored = applyShareMetadata(initialState(), {
    tier: 'free',
    verification: { email: false, photo: false, passport: true }
  });
  assert.equal(restored.options.email, true);
  assert.equal(restored.options.photo, false);
  assert.equal(restored.options.passport, true);
  assert.equal(restored.verificationMethods.some((method) => method.id === 'email'), true);
});

test('finalizing a document includes email even when the draft omitted it', async () => {
  const record = draft(false);
  assert.equal(signingConfigurationError(record), 'Email verification is required.');
  assert.equal(await finalizeDocument(cryptoApp(), record, 'creator-key'), true);
  assert.equal(record.metadata.verification.email, true);
  assert.equal(record.metadata.verification.photo, true);
  assert.equal(signingConfigurationError(record), '');
});

test('the server rejects a new configuration that removes email and keeps an existing one', async () => {
  const removed = mergeSignatureRecords(
    {},
    { hash: 'same', metadata: { verification: { email: true } } },
    { hash: 'same', metadata: { verification: { email: false } } },
    'signer-key',
    'server-key'
  );
  assert.equal(removed.ok, false);
  assert.equal(removed.error, EMAIL_REQUIRED);

  const existing = mergeSignatureRecords(
    {},
    { hash: 'same', metadata: { verification: { email: false } } },
    { hash: 'same', metadata: { verification: { email: false } } },
    'signer-key',
    'server-key'
  );
  assert.notEqual(existing.error, EMAIL_REQUIRED);

  let stored = false;
  const mod = {
    app: {},
    database: {
      saveDocument: async () => {
        stored = true;
        return { document_id: 'doc-1' };
      },
      saveShare: async () => {}
    }
  };
  const rejected = await handleShareRequest(mod, {
    action: 'create',
    recipients: [{ name: 'Ada', email: 'ada@example.com' }],
    document: { finalized: false, metadata: { verification: { email: false } } }
  });
  assert.equal(rejected.success, false);
  assert.match(rejected.error, /Email verification is required/);
  assert.equal(stored, false);

  const kept = await handleShareRequest(mod, {
    action: 'create',
    recipients: [{ name: 'Ada', email: 'ada@example.com' }],
    document: { finalized: true, metadata: { verification: { email: false } } }
  });
  assert.equal(stored, true);
  assert.notEqual(kept.error, 'Email verification is required and cannot be removed.');
});
