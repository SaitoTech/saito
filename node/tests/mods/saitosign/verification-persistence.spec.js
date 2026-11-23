const assert = require('node:assert/strict');
const { createHash } = require('crypto');
const test = require('node:test');
const {
  emailVerificationMessage,
  signEmailVerification,
  validVerification,
  verifiedMethods
} = require('../../../mods/saitosign/lib/auth');
const { copy, emptyDocument } = require('../../../mods/saitosign/lib/document');
const { applyEmailProof } = require('../../../mods/saitosign/lib/recipient-proof');
const { readVerifications } = require('../../../mods/saitosign/lib/transaction');
const verifySlide = require('../../../mods/saitosign/lib/ui/overlays/publish.verify');
const publishTemplate = require('../../../mods/saitosign/lib/ui/overlays/publish.template');
const {
  applyKnownVerifications,
  copyVerification,
  keepMethod,
  proofPublicKey,
  signerKeyForRecord
} = require('../../../mods/saitosign/lib/verification-records');

const EMAIL = 'ada@example.com';
const SIGNER = 'ada-key';
const SERVER = 'server-key';
const PHOTO = 'data:image/png;base64,photo-one';
const PHOTO_TWO = 'data:image/png;base64,photo-two';
const PASSPORT = 'data:image/jpeg;base64,passport-one';
const PASSPORT_TWO = 'data:image/jpeg;base64,passport-two';

function app(publicKey = SIGNER) {
  return {
    crypto: {
      hash(value) {
        return createHash('sha256').update(String(value)).digest('hex');
      },
      signMessage(message, privateKey) {
        return `sig:${privateKey}:${message}`;
      },
      verifyMessage(message, signature, publicKeyValue) {
        return signature === `sig:${publicKeyValue}:${message}`;
      },
      compressPublicKey(value) {
        return `compressed:${value}`;
      }
    },
    wallet: {
      publicKey,
      getPrivateKey: async () => SERVER
    }
  };
}

function sign(cryptoApp, message, privateKey) {
  return cryptoApp.crypto.signMessage(message, privateKey);
}

function emailEntry(cryptoApp, signerKey = SIGNER, method) {
  const message = emailVerificationMessage(EMAIL, signerKey);
  const entry = {
    publickey: SERVER,
    message,
    signature: sign(cryptoApp, message, SERVER)
  };
  if (method) {
    entry.method = method;
  }
  return entry;
}

function photoEntry(cryptoApp, image, signerKey = SIGNER) {
  const message = `Photo received for verification of publickey ${signerKey} with image ${cryptoApp.crypto.hash(image)}`;
  return {
    method: 'photo',
    publickey: signerKey,
    message,
    signature: sign(cryptoApp, message, signerKey),
    photo: image
  };
}

function passportEntry(cryptoApp, image, signerKey = SIGNER) {
  const message = `Passport image supplied for verification of publickey ${signerKey} with image ${cryptoApp.crypto.hash(image)}`;
  return {
    method: 'passport',
    publickey: signerKey,
    message,
    signature: sign(cryptoApp, message, signerKey),
    image
  };
}

function user(verifications, publickey = SIGNER) {
  return { name: 'Ada', email: EMAIL, publickey, verifications };
}

function byMethod(record, method) {
  return record.verifications.filter((entry) => entry.method === method);
}

function methods(statuses = {}) {
  return ['email', 'photo', 'passport'].map((id) => ({
    id,
    required: true,
    status: statuses[id] || 'pending',
    selected: id === 'email',
    description: id
  }));
}

test('an explicit email proof survives a photo proof and both remain valid', () => {
  const cryptoApp = app();
  const live = user([emailEntry(cryptoApp, SIGNER, 'email')]);
  keepMethod(cryptoApp, live, photoEntry(cryptoApp, PHOTO));
  const email = byMethod(live, 'email');
  const photo = byMethod(live, 'photo');
  assert.equal(email.length, 1);
  assert.equal(photo.length, 1);
  assert.equal(validVerification(cryptoApp, email[0], live), true);
  assert.equal(validVerification(cryptoApp, photo[0], live), true);
  assert.equal(live.publickey, SIGNER);
});

test('a methodless email proof survives a photo proof and stays verifiable', () => {
  const cryptoApp = app();
  const original = emailEntry(cryptoApp);
  const live = user([original]);
  keepMethod(cryptoApp, live, photoEntry(cryptoApp, PHOTO));
  const email = byMethod(live, 'email');
  assert.equal(email.length, 1);
  assert.equal(email[0].message, original.message);
  assert.equal(email[0].signature, original.signature);
  assert.equal(email[0].publickey, SERVER);
  assert.equal(validVerification(cryptoApp, email[0], live), true);
  assert.equal(validVerification(cryptoApp, byMethod(live, 'photo')[0], live), true);
});

test('a replacement photo proof replaces only the photo proof', () => {
  const cryptoApp = app();
  const live = user([emailEntry(cryptoApp, SIGNER, 'email'), photoEntry(cryptoApp, PHOTO)]);
  keepMethod(cryptoApp, live, photoEntry(cryptoApp, PHOTO_TWO));
  assert.equal(byMethod(live, 'email').length, 1);
  assert.equal(byMethod(live, 'photo').length, 1);
  assert.equal(byMethod(live, 'photo')[0].photo, PHOTO_TWO);
  assert.equal(validVerification(cryptoApp, byMethod(live, 'email')[0], live), true);
  assert.equal(validVerification(cryptoApp, byMethod(live, 'photo')[0], live), true);
});

test('a passport proof preserves email and photo, and a later passport replaces only itself', () => {
  const cryptoApp = app();
  const live = user([
    emailEntry(cryptoApp, SIGNER, 'email'),
    photoEntry(cryptoApp, PHOTO)
  ]);
  keepMethod(cryptoApp, live, passportEntry(cryptoApp, PASSPORT));
  assert.equal(byMethod(live, 'email').length, 1);
  assert.equal(byMethod(live, 'photo').length, 1);
  assert.equal(byMethod(live, 'passport').length, 1);
  assert.equal(validVerification(cryptoApp, byMethod(live, 'email')[0], live), true);
  assert.equal(validVerification(cryptoApp, byMethod(live, 'photo')[0], live), true);
  assert.equal(validVerification(cryptoApp, byMethod(live, 'passport')[0], live), true);

  keepMethod(cryptoApp, live, passportEntry(cryptoApp, PASSPORT_TWO));
  assert.equal(byMethod(live, 'email').length, 1);
  assert.equal(byMethod(live, 'photo').length, 1);
  assert.equal(byMethod(live, 'passport').length, 1);
  assert.equal(byMethod(live, 'passport')[0].image, PASSPORT_TWO);
});

test('invalid, mismatched, and unrelated proofs do not count as email verification', () => {
  const cryptoApp = app();
  const mismatched = emailEntry(cryptoApp, 'other-key', 'email');
  const unsigned = emailEntry(cryptoApp, SIGNER, 'email');
  unsigned.signature = 'sig:server-key:nope';
  const unrelated = { publickey: SERVER, message: 'unrelated record', signature: sign(cryptoApp, 'unrelated record', SERVER) };
  const live = user([mismatched, unsigned, unrelated]);

  assert.equal(validVerification(cryptoApp, mismatched, live), false);
  assert.equal(validVerification(cryptoApp, unsigned, live), false);
  assert.equal(validVerification(cryptoApp, unrelated, live), false);
  assert.deepEqual(verifiedMethods(cryptoApp, live), []);

  keepMethod(cryptoApp, live, photoEntry(cryptoApp, PHOTO));
  assert.equal(byMethod(live, 'email').length, 0);
  assert.equal(live.verifications.some((entry) => entry.message === 'unrelated record'), false);
  assert.deepEqual(verifiedMethods(cryptoApp, live), ['photo']);
});

test('copying and reading verifications preserve explicit and inferred email methods', () => {
  const cryptoApp = app();
  const explicit = emailEntry(cryptoApp, SIGNER, 'email');
  const methodless = emailEntry(cryptoApp);
  const photo = photoEntry(cryptoApp, PHOTO);
  const passport = passportEntry(cryptoApp, PASSPORT);

  const copiedExplicit = copyVerification(explicit);
  const copiedEmail = copyVerification(methodless);
  assert.equal(copiedExplicit.method, 'email');
  assert.equal(copiedExplicit.message, explicit.message);
  assert.equal(copiedExplicit.signature, explicit.signature);
  assert.equal(copiedExplicit.publickey, SERVER);
  assert.equal(copiedEmail.method, 'email');
  assert.notEqual(copiedEmail.method, '');

  const read = readVerifications([methodless, photo, passport]);
  assert.deepEqual(read.map((entry) => entry.method), ['email', 'photo', 'passport']);
  assert.equal(read[0].message, methodless.message);

  const record = emptyDocument();
  record.users = [user([methodless, photo, passport])];
  const restored = copy(record);
  const methodsAfterCopy = restored.users[0].verifications.map((entry) => entry.method);
  assert.deepEqual(methodsAfterCopy, ['email', 'photo', 'passport']);
  const reread = readVerifications(restored.users[0].verifications);
  assert.deepEqual(reread.map((entry) => entry.method), ['email', 'photo', 'passport']);
  reread.forEach((entry) => {
    assert.equal(validVerification(cryptoApp, entry, restored.users[0]), true);
  });
});

test('known verifications follow a valid stored proof, an invitation proof, or no proof', async () => {
  const cryptoApp = app();
  const state = { you: { index: 0, email: EMAIL }, focus: 'email', verificationMethods: methods() };

  const stored = user([emailEntry(cryptoApp, SIGNER, 'email')]);
  const fromStore = applyKnownVerifications(cryptoApp, stored, state);
  assert.equal(fromStore.verificationMethods.find((method) => method.id === 'email').status, 'verified');

  const invited = emptyDocument();
  invited.users = [user([])];
  invited.users[0].publickey = '';
  const proof = await signEmailVerification(cryptoApp, EMAIL, SIGNER);
  const outcome = applyEmailProof(invited, {
    email: EMAIL,
    publickey: SIGNER,
    serverKey: SERVER,
    message: proof.message,
    signature: proof.signature
  }, cryptoApp);
  assert.equal(outcome.status, 'applied');
  const fromInvitation = applyKnownVerifications(cryptoApp, invited.users[0], state);
  assert.equal(fromInvitation.verificationMethods.find((method) => method.id === 'email').status, 'verified');

  const missing = applyKnownVerifications(cryptoApp, user([]), {
    ...state,
    verificationMethods: methods({ email: 'verified' })
  });
  assert.equal(missing.verificationMethods.find((method) => method.id === 'email').status, 'pending');
});

test('repainting after photo verification leaves a valid email proof verified', () => {
  const cryptoApp = app();
  const live = user([emailEntry(cryptoApp)]);
  keepMethod(cryptoApp, live, photoEntry(cryptoApp, PHOTO));
  const painted = applyKnownVerifications(cryptoApp, live, {
    you: { index: 0, email: EMAIL },
    focus: 'email',
    verificationMethods: methods()
  });
  const email = painted.verificationMethods.find((method) => method.id === 'email');
  const photo = painted.verificationMethods.find((method) => method.id === 'photo');
  assert.equal(email.status, 'verified');
  assert.equal(photo.status, 'verified');

  const pending = verifySlide(painted);
  assert.match(pending.body, /Email address verified/);
  assert.equal(pending.body.includes('data-publish-action="send-email"'), false);

  const waiting = verifySlide({
    you: { index: 0, email: EMAIL },
    focus: 'email',
    verificationMethods: methods()
  });
  assert.match(waiting.body, /data-publish-action="send-email"/);
  assert.match(waiting.body, /data-publish-action="submit-signature"/);
  assert.equal(waiting.body.includes('Email address verified'), false);
});

test('the identity screen uses the required-information heading and privacy subtitle', () => {
  const state = {
    step: 'verify',
    history: ['identity'],
    you: { index: 0, email: EMAIL },
    focus: 'email',
    verificationMethods: methods()
  };
  const slide = verifySlide(state);
  assert.equal(slide.title, 'Before you sign the document, please provide the required information.');
  assert.equal(slide.subtitle, 'Any information you provide will be included in the final document, and available to any party to whom you provide access.');
  assert.equal(slide.disclosure, undefined);
  assert.equal(slide.subtitle.includes('Please complete the steps below to advance.'), false);

  const html = publishTemplate(state);
  assert.match(html, /<h3 class="title">Before you sign the document, please provide the required information\.<\/h3>/);
  assert.match(html, /<p class="subtitle">Any information you provide will be included in the final document, and available to any party to whom you provide access\.<\/p>/);
  assert.equal(html.includes('class="disclosure"'), false);
  assert.equal(html.includes('Please complete the steps below to advance.'), false);
  assert.match(html, /data-publish-action="advance"/);
});

test('a valid email proof keeps its public key when the wallet key would be normalized', () => {
  const hex = 'ab'.repeat(32);
  const cryptoApp = app(hex);
  const live = user([emailEntry(cryptoApp, hex, 'email')], hex);
  assert.equal(signerKeyForRecord(cryptoApp, live, EMAIL), hex);
  assert.notEqual(signerKeyForRecord(cryptoApp, live, EMAIL), `compressed:${hex}`);
  assert.equal(signerKeyForRecord(cryptoApp, user([]), EMAIL), `compressed:${hex}`);
  assert.equal(proofPublicKey(live, `compressed:${hex}`), hex);
  assert.equal(proofPublicKey(user([]), SIGNER), SIGNER);
});
