const assert = require('node:assert/strict');
const { createHash } = require('crypto');
const test = require('node:test');
const {
  emailVerificationMessage,
  signEmailVerification,
  validVerification,
  verificationSatisfied,
  finalizeDocument
} = require('../../../mods/saitosign/lib/auth');
const {
  acceptableEmailProof,
  applyEmailProof,
  restartSignerWallet,
  restoreWalletProgress
} = require('../../../mods/saitosign/lib/recipient-proof');
const { recipientLink, shareLink } = require('../../../mods/saitosign/lib/share-protocol');

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
      }
    },
    wallet: {
      getPrivateKey: async () => 'server-key'
    }
  };
}

function record() {
  return {
    hash: 'doc-hash',
    metadata: {
      tier: 'premium',
      verification: { email: true, photo: true, phone: false, passport: false, legal_review: false }
    },
    users: [
      { name: 'Ada', email: 'ada@example.com', publickey: '', verifications: [], signatures: [] },
      { name: 'Bea', email: 'bea@example.com', publickey: 'bea-key', verifications: [{ method: 'email', publickey: 'server-key', message: 'keep', signature: 'keep' }], signatures: [{ id: 2, signature: 'bea-sig', document_hash: 'doc-hash' }] }
    ],
    actions: []
  };
}

test('recipient links differ and the sender link stays generic', () => {
  const origin = 'https://saito.tech';
  const generic = shareLink(origin, 'doc', 'share-token');
  const ada = recipientLink(origin, 'doc', 'share-token', 'ada-secret');
  const bea = recipientLink(origin, 'doc', 'share-token', 'bea-secret');
  assert.equal(generic.includes('verify'), false);
  assert.notEqual(ada, bea);
  assert.equal(ada.endsWith('#verify=ada-secret'), true);
  assert.equal(bea.endsWith('#verify=bea-secret'), true);
});

test('a redeemed proof is stored for the invited email and satisfies email verification', async () => {
  const cryptoApp = app();
  const proof = await signEmailVerification(cryptoApp, 'ada@example.com', 'ada-key');
  const next = record();
  const outcome = applyEmailProof(next, {
    email: 'ada@example.com',
    publickey: 'ada-key',
    serverKey: 'server-key',
    message: proof.message,
    signature: proof.signature
  }, cryptoApp);
  assert.equal(outcome.status, 'applied');
  assert.equal(outcome.index, 0);
  const entry = next.users[0].verifications[0];
  assert.deepEqual(entry, {
    method: 'email',
    publickey: 'server-key',
    message: emailVerificationMessage('ada@example.com', 'ada-key'),
    signature: proof.signature,
    returned: true
  });
  assert.equal(validVerification(cryptoApp, entry, next.users[0]), true);
  assert.equal(acceptableEmailProof(cryptoApp, {
    email: 'ada@example.com',
    publickey: 'ada-key',
    serverKey: 'server-key',
    message: proof.message,
    signature: proof.signature
  }), true);
  next.metadata.verification.photo = false;
  assert.equal(verificationSatisfied(cryptoApp, next, next.users[0]), true);
  next.metadata.verification.photo = true;
  assert.equal(verificationSatisfied(cryptoApp, next, next.users[0]), false);
  assert.equal(next.users[1].signatures[0].signature, 'bea-sig');
});

test('a different wallet can restart one signer without changing the other', async () => {
  const cryptoApp = app();
  const next = record();
  next.users[0].publickey = 'old-key';
  next.users[0].signatures = [{ id: 1, signature: 'old-sig', document_hash: 'doc-hash' }];
  next.users[0].verifications = [{ method: 'email', publickey: 'server-key', message: 'old', signature: 'old' }];
  const proof = await signEmailVerification(cryptoApp, 'ada@example.com', 'new-key');
  const incoming = {
    email: 'ada@example.com',
    publickey: 'new-key',
    serverKey: 'server-key',
    message: proof.message,
    signature: proof.signature
  };
  const mismatch = applyEmailProof(next, incoming, cryptoApp);
  assert.equal(mismatch.status, 'mismatch');
  assert.equal(next.users[0].publickey, 'old-key');
  assert.equal(restartSignerWallet(next, mismatch.index), true);
  assert.deepEqual(next.users[0].signatures, []);
  assert.deepEqual(next.users[0].verifications, []);
  assert.equal(next.users[1].publickey, 'bea-key');
  assert.equal(next.users[1].signatures[0].signature, 'bea-sig');
  const applied = applyEmailProof(next, incoming, cryptoApp);
  assert.equal(applied.status, 'applied');
  assert.equal(next.users[0].publickey, 'new-key');
  assert.equal(validVerification(cryptoApp, next.users[0].verifications[0], next.users[0]), true);
});

test('saved invitation progress is restored for the same wallet and document', async () => {
  const cryptoApp = app();
  const source = {
    document: {
      name: 'Agreement.pdf',
      pdf: [{ name: 'Agreement.pdf', pdf: Buffer.from('%PDF-1.4\n').toString('base64') }],
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
    metadata: { tier: 'free', verification: { email: true, phone: false, photo: false, passport: false, legal_review: false } }
  };
  assert.equal(await finalizeDocument(cryptoApp, source, 'creator-key'), true);
  const proof = await signEmailVerification(cryptoApp, 'ada@example.com', 'ada-key');
  const local = JSON.parse(JSON.stringify(source));
  applyEmailProof(local, {
    email: 'ada@example.com',
    publickey: 'ada-key',
    serverKey: 'server-key',
    message: proof.message,
    signature: proof.signature
  }, cryptoApp);
  const restored = restoreWalletProgress(cryptoApp, source, local, ['ada-key']);
  assert.equal(restored.users[0].publickey, 'ada-key');
  assert.equal(validVerification(cryptoApp, restored.users[0].verifications[0], restored.users[0]), true);
  assert.equal(source.users[0].publickey, '');
  const otherWallet = restoreWalletProgress(cryptoApp, source, local, ['someone-else']);
  assert.equal(otherWallet.users[0].publickey, '');
});
