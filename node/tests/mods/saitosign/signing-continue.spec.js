const assert = require('node:assert/strict');
const { createHash } = require('crypto');
const {
  addInitial,
  addSignature,
  acceptedSignatureKeys,
  emailVerificationMessage,
  finalizeDocument,
  userSignaturesUploaded
} = require('../../../mods/saitosign/lib/auth');
const Workspace = require('../../../mods/saitosign/lib/ui/workspace');
const workspaceTemplate = require('../../../mods/saitosign/lib/ui/workspace.template');

const SERVER = 'server-key';
const ADA = 'user-a';
const CONTINUE = '<button type="button" class="export primary" data-export>Continue</button>';

function app(publicKey = ADA) {
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
      }
    },
    wallet: {
      publicKey,
      getPrivateKey: async () => 'creator-key'
    }
  };
}

function box(id, user, page, type = 'signature') {
  return { id, type, user, page, x: 0.1, y: 0.1 + id * 0.05, width: 0.3, height: 0.08 };
}

async function preparedDocument(cryptoApp) {
  const record = {
    document: {
      name: 'Agreement.pdf',
      pdf: [{
        name: 'Agreement.pdf',
        pdf: Buffer.from('%PDF-1.4\n').toString('base64'),
        page_count: 2,
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
      box(1, 0, 1, 'signature'),
      box(2, 0, 2, 'initial'),
      box(3, 1, 1, 'signature'),
      box(4, 0, 1, 'date')
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

function signIds(cryptoApp, record, index, key, ids) {
  const user = record.users[index];
  const additions = record.actions
    .filter((action) => action.user === index && ids.includes(action.id))
    .map((action) => (
      action.type === 'initial'
        ? addInitial(cryptoApp, action, key, record.hash)
        : addSignature(cryptoApp, action, key, record.hash)
    ));
  user.signatures = additions;
}

function railFor(cryptoApp, record) {
  const workspace = new Workspace(cryptoApp, { document: record, receivedBy: 'link', share: { id: 'share' } });
  return workspaceTemplate.rail(workspace.view());
}

test('Continue stays hidden until the current signer completes every assigned signature and initial', async () => {
  const cryptoApp = app();
  const record = await preparedDocument(cryptoApp);
  authorize(cryptoApp, record, 0, ADA);
  authorize(cryptoApp, record, 1, 'user-b');

  signIds(cryptoApp, record, 0, ADA, [1]);
  assert.equal(Workspace.signingReady(cryptoApp, record), false);
  assert.equal(railFor(cryptoApp, record).includes('data-export'), false);

  signIds(cryptoApp, record, 0, ADA, [1, 2]);
  assert.equal(Workspace.signingReady(cryptoApp, record), true);
  assert.equal(railFor(cryptoApp, record).includes(CONTINUE), true);

  record.users[0].signatures = record.users[0].signatures.filter((entry) => entry.id !== 2);
  assert.equal(Workspace.signingReady(cryptoApp, record), false);
  assert.equal(railFor(cryptoApp, record).includes('data-export'), false);

  signIds(cryptoApp, record, 0, ADA, [1, 2]);
  record.users[0].signatures.find((entry) => entry.id === 2).signature = 'sig:not-valid';
  assert.equal(Workspace.signingReady(cryptoApp, record), false);
  assert.equal(railFor(cryptoApp, record).includes('data-export'), false);
});

test('another recipient and non-signature fields do not block Continue', async () => {
  const cryptoApp = app();
  const record = await preparedDocument(cryptoApp);
  authorize(cryptoApp, record, 0, ADA);
  signIds(cryptoApp, record, 0, ADA, [1, 2]);
  assert.equal(record.users[1].signatures.length, 0);
  assert.equal(record.actions.some((action) => action.type === 'date' && !action.signature), true);
  assert.equal(Workspace.signingReady(cryptoApp, record), true);
  assert.equal(railFor(cryptoApp, record).includes(CONTINUE), true);
});

test('other signers and a draft document do not change the current signer Continue rule', async () => {
  const beaApp = app('user-b');
  const record = await preparedDocument(beaApp);
  authorize(beaApp, record, 0, ADA);
  authorize(beaApp, record, 1, 'user-b');
  signIds(beaApp, record, 0, ADA, [1, 2]);
  assert.equal(record.users[1].signatures.length, 0);
  assert.equal(Workspace.signingReady(beaApp, record), false);
  assert.equal(railFor(beaApp, record).includes('data-export'), false);

  record.users.push({ name: 'Cam', email: 'cam@example.com', publickey: 'user-c', verifications: [], signatures: [] });
  const camApp = app('user-c');
  assert.equal(Workspace.signingReady(camApp, record), true);
  assert.equal(railFor(camApp, record).includes(CONTINUE), true);

  const draft = JSON.parse(JSON.stringify(record));
  draft.finalized = false;
  const creator = new Workspace(app('creator-key'), { document: draft });
  assert.equal(workspaceTemplate.rail(creator.view()).includes(CONTINUE), true);
});

test('a completed local signature stays on Continue until the server has accepted it', async () => {
  const cryptoApp = app();
  const record = await preparedDocument(cryptoApp);
  authorize(cryptoApp, record, 0, ADA);
  authorize(cryptoApp, record, 1, 'user-b');
  signIds(cryptoApp, record, 0, ADA, [1, 2]);
  signIds(cryptoApp, record, 1, 'user-b', [3]);
  const local = railFor(cryptoApp, record);
  assert.equal(local.includes(CONTINUE), true);
  assert.equal(local.includes('Check Status'), false);
  assert.doesNotMatch(local, /export primary verified/);
  assert.equal(userSignaturesUploaded(cryptoApp, record, acceptedSignatureKeys(record)), true);

  const accepted = acceptedSignatureKeys(record);
  const shared = new Workspace(cryptoApp, { document: record, receivedBy: 'link', share: { id: 'share', acceptedSignatures: accepted } });
  const uploaded = workspaceTemplate.rail(shared.view());
  assert.match(uploaded, /class="export primary verified" data-export>Check Status/);

  signIds(cryptoApp, record, 0, ADA, [1, 2]);
  const partial = new Set([...accepted].filter((key) => !key.startsWith('0:2:')));
  shared.mod.share.acceptedSignatures = partial;
  const replaced = workspaceTemplate.rail(shared.view());
  assert.equal(replaced.includes(CONTINUE), true);
  assert.equal(replaced.includes('Check Status'), false);
  assert.equal(userSignaturesUploaded(cryptoApp, record, partial), false);
});
