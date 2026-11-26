const assert = require('node:assert/strict');
const { createHash } = require('crypto');
const test = require('node:test');
const {
  addSignature,
  documentHash,
  emailVerificationMessage,
  signEmailVerification
} = require('../../../mods/saitosign/lib/auth');
const { signerAudit } = require('../../../mods/saitosign/lib/ui/overlays/signer-audit.model');
const signerSlide = require('../../../mods/saitosign/lib/ui/overlays/signer-audit.template');
const publishTemplate = require('../../../mods/saitosign/lib/ui/overlays/publish.template');
const { inspectableSignerStep } = require('../../../mods/saitosign/lib/ui/overlays/publish.share');

const EMAIL = 'ada@example.com';
const OTHER = 'bea@example.com';
const SIGNER = 'ada-key';
const OTHER_KEY = 'bea-key';
const SERVER = 'server-key';
const PHOTO = 'data:image/png;base64,photo';

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
      getPrivateKey: async () => SERVER
    }
  };
}

function field(userIndex, id = 1) {
  return {
    id,
    type: 'signature',
    user: userIndex,
    page: 1,
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.08
  };
}

function person(name, email, publickey, extra = {}) {
  return {
    name,
    email,
    publickey,
    verifications: extra.verifications || [],
    signatures: extra.signatures || []
  };
}

function record(users, actions = []) {
  const cryptoApp = app();
  const next = {
    creator: 'creator-key',
    document: { name: 'Agreement.pdf', pdf: [] },
    metadata: { tier: 'free', verification: { email: true, photo: true, phone: false, passport: false, legal_review: false } },
    users,
    actions,
    finalized: false,
    hash: ''
  };
  next.hash = documentHash(cryptoApp, next);
  next.finalized = true;
  return next;
}

async function emailProof(cryptoApp, email, signerKey, { returned = true, signature } = {}) {
  const proof = await signEmailVerification(cryptoApp, email, signerKey);
  return {
    method: 'email',
    publickey: SERVER,
    message: proof.message,
    signature: signature === undefined ? proof.signature : signature,
    returned
  };
}

function photoProof(cryptoApp, signerKey, valid = true) {
  const message = `Photo received for verification of publickey ${signerKey} with image ${cryptoApp.crypto.hash(PHOTO)}`;
  return {
    method: 'photo',
    publickey: signerKey,
    message,
    signature: valid ? cryptoApp.crypto.signMessage(message, signerKey) : 'sig:other:nope',
    photo: PHOTO
  };
}

function slide(view, section = 'email', photo = null) {
  return signerSlide({ auditView: view, audit: { section, photo } });
}

test('signer tables stay clickable before anyone has signed', () => {
  const signers = [
    { index: 0, name: 'Ada', places: 1, signed: false, requirements: ['Signature required: all pages'] },
    { index: 1, name: 'Bea', places: 1, signed: false, requirements: ['Signature required: page 2'] }
  ];
  ['ready', 'share', 'signature-complete', 'signature-export'].forEach((step) => {
    assert.equal(inspectableSignerStep(step), true);
    const html = publishTemplate({ step, history: ['select'], signers, uploaded: step !== 'ready' });
    assert.match(html, /data-signer-audit="0"/);
    assert.match(html, /data-signer-audit="1"/);
    assert.match(html, /View verification details for Ada/);
    assert.match(html, /View verification details for Bea/);
    assert.match(html, /Not signed/);
  });
  assert.equal(inspectableSignerStep('verify'), false);
});

test('an unsigned signer opens details that say what is missing', () => {
  const cryptoApp = app();
  const doc = record([person('Ada', EMAIL, ''), person('Bea', OTHER, OTHER_KEY)], [field(0), field(1, 2)]);
  const ada = signerAudit(cryptoApp, doc, 0);
  const bea = signerAudit(cryptoApp, doc, 1);
  const adaHtml = slide(ada).body;
  const beaHtml = slide(bea, 'signatures').body;
  assert.match(adaHtml, /<dd>Ada<\/dd>/);
  assert.match(beaHtml, /<dd>Bea<\/dd>/);
  assert.doesNotMatch(adaHtml, /Bea/);
  assert.match(adaHtml, /Email verification: Not yet completed/);
  assert.match(slide(ada, 'photos').body, /Photo verification: Not yet provided/);
  assert.match(beaHtml, /Digital signature: Not yet provided/);
  assert.doesNotMatch(adaHtml, /data-audit-copy|>Copy</);
});

test('email verification shows the server signature and no invented signer signature', async () => {
  const cryptoApp = app();
  const proof = await emailProof(cryptoApp, EMAIL, SIGNER);
  const doc = record([person('Ada', EMAIL, SIGNER, { verifications: [proof] })], [field(0)]);
  const view = signerAudit(cryptoApp, doc, 0);
  assert.equal(view.emails[0].valid, true);
  assert.equal(view.signatures[0].recorded, false);
  const html = slide(view).body;
  assert.match(html, /server signed the challenge/i);
  assert.match(html, /does not create a second signature/);
  assert.match(html, new RegExp(emailVerificationMessage(EMAIL, SIGNER)));
  assert.match(html, new RegExp(proof.signature));
  assert.match(html, new RegExp(SERVER));
  assert.match(html, /Cryptographically verified/);
  assert.match(html, /The signer returned the verification code/);
  assert.doesNotMatch(html, /Email address on the signer record|Signer public key named for this challenge|data-audit-copy/);
  assert.match(slide(view, 'signatures').body, /Digital signature: Not yet provided/);
});

test('a returned code that fails verification is not shown as verified', async () => {
  const cryptoApp = app();
  const proof = await emailProof(cryptoApp, EMAIL, SIGNER, { signature: 'sig:server-key:other' });
  const doc = record([person('Ada', EMAIL, SIGNER, { verifications: [proof] })], [field(0)]);
  const html = slide(signerAudit(cryptoApp, doc, 0)).body;
  assert.match(html, /Verification failed/);
  assert.doesNotMatch(html, /Cryptographically verified/);
});

test('a document signature can be present while verification is incomplete', () => {
  const cryptoApp = app();
  const doc = record([person('Ada', EMAIL, SIGNER)], [field(0)]);
  doc.users[0].signatures = [addSignature(cryptoApp, field(0), SIGNER, doc.hash)];
  const view = signerAudit(cryptoApp, doc, 0);
  assert.equal(view.signatures[0].valid, true);
  assert.equal(view.emails.length, 0);
  const html = slide(view, 'signatures').body;
  assert.match(html, /Cryptographically verified/);
  assert.match(html, /Signer signature/);
  assert.match(html, new RegExp(doc.hash));
  assert.match(slide(view).body, /Email verification: Not yet completed/);
});

test('email and photo evidence both verify, and a bad photo does not', () => {
  const cryptoApp = app();
  const message = emailVerificationMessage(EMAIL, SIGNER);
  const email = {
    method: 'email',
    publickey: SERVER,
    message,
    signature: cryptoApp.crypto.signMessage(message, SERVER),
    returned: true
  };
  const doc = record([
    person('Ada', EMAIL, SIGNER, { verifications: [email, photoProof(cryptoApp, SIGNER, true)] })
  ], [field(0)]);
  doc.users[0].signatures = [addSignature(cryptoApp, field(0), SIGNER, doc.hash)];
  const view = signerAudit(cryptoApp, doc, 0);
  assert.equal(view.emails[0].valid, true);
  assert.equal(view.images[0].valid, true);
  assert.equal(view.signatures[0].valid, true);
  const photo = slide(view, 'photos', 0).body;
  assert.match(photo, /signed this image/);
  assert.match(photo, /Cryptographically verified/);
  assert.match(photo, /Signer signature/);

  const broken = record([
    person('Ada', EMAIL, SIGNER, { verifications: [photoProof(cryptoApp, SIGNER, false)] })
  ]);
  const failed = slide(signerAudit(cryptoApp, broken, 0), 'photos', 0).body;
  assert.match(failed, /Verification failed/);
  assert.doesNotMatch(failed, /Cryptographically verified/);
});

test('each signer entry resolves to that signer', async () => {
  const cryptoApp = app();
  const adaProof = await emailProof(cryptoApp, EMAIL, SIGNER);
  const beaMessage = emailVerificationMessage(OTHER, OTHER_KEY);
  const beaProof = {
    method: 'email',
    publickey: SERVER,
    message: beaMessage,
    signature: cryptoApp.crypto.signMessage(beaMessage, SERVER),
    returned: false
  };
  const doc = record([
    person('Ada', EMAIL, SIGNER, { verifications: [adaProof] }),
    person('Bea', OTHER, OTHER_KEY, { verifications: [beaProof] })
  ], [field(0), field(1, 2)]);
  const ada = slide(signerAudit(cryptoApp, doc, 0)).body;
  const bea = slide(signerAudit(cryptoApp, doc, 1)).body;
  assert.match(ada, /The signer returned the verification code/);
  assert.match(bea, /The signer has not returned the verification code/);
  assert.match(ada, /ada@example.com/);
  assert.match(bea, /bea@example.com/);
  assert.doesNotMatch(ada, /bea@example.com/);
});
