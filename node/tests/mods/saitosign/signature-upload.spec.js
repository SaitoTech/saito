const assert = require('node:assert/strict');
const { createHash } = require('crypto');
const { finalizeDocument } = require('../../../mods/saitosign/lib/auth');
const PublishOverlay = require('../../../mods/saitosign/lib/ui/overlays/publish');
const ShareFlow = require('../../../mods/saitosign/lib/ui/overlays/distribute');
const {
  signatureCompleteSlide,
  signatureUploadSlide,
  signatureUploadedSlide,
  signatureUploadOutcome,
  EMAIL_DELIVERY_NOTICE
} = require('../../../mods/saitosign/lib/ui/overlays/publish.share');
const workspaceTemplate = require('../../../mods/saitosign/lib/ui/workspace.template');

const TIMEOUT = 'The sharing server did not respond. Nothing new was confirmed. Check your connection and try again.';
const CONFIRMATION = 'You have provided all of the signatures necessary. You will be notified by email once all parties have completed signing the document. In the meantime, you may click on any entry in the table above to see the state of the document and inspect the cryptographic signatures and attestations.';

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
      publicKey: 'creator-key',
      getPrivateKey: async () => 'creator-key'
    }
  };
}

function signedState() {
  return {
    step: 'signature-complete',
    uploaded: true,
    signers: [{
      index: 0,
      name: 'Ada',
      places: 2,
      signed: true,
      creator: false,
      requirements: ['Signature required: page 1', 'Initials required: page 2']
    }, {
      index: 1,
      name: 'Bea',
      places: 1,
      signed: false,
      creator: false,
      requirements: ['Signature required: page 1']
    }]
  };
}

async function finalizedRecord(cryptoApp) {
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
      { name: 'Ada', email: 'ada@example.com', publickey: 'user-a', verifications: [], signatures: [{ id: 1, signature: 'local-signature' }] }
    ],
    actions: [
      { id: 1, type: 'signature', user: 0, page: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.08 }
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

function uploader(cryptoApp, record, syncIfShared) {
  const publish = Object.create(PublishOverlay.prototype);
  const opened = [];
  const failures = [];
  const loads = [];
  publish.signatureUpload = false;
  publish.app = cryptoApp;
  publish.mod = {
    document: record,
    shareLoad: null,
    syncIfShared,
    main: {
      showShareLoad(state) {
        loads.push(state);
      },
      fail(message) {
        failures.push(message);
      }
    }
  };
  publish.openStatus = (note, entry, extra) => {
    opened.push({ note, entry, extra });
  };
  return { publish, opened, failures, loads };
}

test('a successful upload is the only path to the Document Signed page', () => {
  const pending = signatureCompleteSlide({ step: 'signature-complete', uploaded: false, signers: [] });
  assert.equal(pending.title, '');
  assert.doesNotMatch(pending.body, /Signature Complete/);
  assert.doesNotMatch(pending.body, /Upload your signatures/);
  assert.match(pending.body, /Uploading your signatures/);

  const accepted = signatureUploadOutcome({ ok: true, complete: false, already_present: false });
  const already = signatureUploadOutcome({ ok: true, complete: false, already_present: true });
  const everyone = signatureUploadOutcome({ ok: true, complete: true });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.complete, false);
  assert.equal(already.accepted, true);
  assert.equal(everyone.accepted, true);
  assert.equal(everyone.complete, true);

  const slide = signatureCompleteSlide(signedState());
  assert.equal(slide.title, 'Document Signed');
  assert.match(slide.body, new RegExp(CONFIRMATION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(slide.body, /data-signer-audit="0"/);
  assert.match(slide.body, /data-signer-audit="1"/);
  assert.match(slide.body, />Not signed</);
  assert.doesNotMatch(slide.body, /Signature Complete -- Notify Counterparties/);
  assert.doesNotMatch(slide.body, /Upload your signatures/);
  assert.doesNotMatch(slide.body, /All required signatures have been completed/);
});

test('a timeout or rejection does not count as server acceptance', () => {
  const timeout = signatureUploadOutcome({ ok: false, error: TIMEOUT });
  const rejected = signatureUploadOutcome({ ok: false, error: 'The signatures could not be uploaded.' });
  const skipped = signatureUploadOutcome({ ok: true, skipped: true });
  assert.equal(timeout.accepted, false);
  assert.match(timeout.message, /Nothing new was confirmed/);
  assert.doesNotMatch(timeout.message, /rejected/i);
  assert.match(timeout.message, /still saved on this device/);
  assert.equal(rejected.accepted, false);
  assert.match(rejected.message, /still saved on this device/);
  assert.equal(skipped.accepted, false);
  assert.match(skipped.message, /not connected to a shared copy/);
});

test('Continue uploads through the existing shared-document upload and keeps local signatures on failure', async () => {
  const cryptoApp = app();
  const record = await finalizedRecord(cryptoApp);
  const signatures = record.users[0].signatures;
  let calls = 0;
  const { publish, opened } = uploader(cryptoApp, record, async () => {
    calls += 1;
    return { ok: false, error: TIMEOUT };
  });

  await publish.uploadCompletedSignatures();
  await publish.uploadCompletedSignatures();

  assert.equal(calls, 2);
  assert.equal(record.users[0].signatures, signatures);
  assert.deepEqual(opened, []);
  assert.equal(publish.state.step, 'signature-upload');
  assert.equal(publish.state.uploaded, false);
  assert.match(publish.state.uploadError, /Nothing new was confirmed/);
  assert.match(publish.state.uploadError, /still saved on this device/);
  const error = signatureUploadSlide(publish.state);
  assert.equal(error.title, 'Upload not confirmed');
  assert.match(error.subtitle, /not yet been confirmed as uploaded/);
  assert.match(error.body, /retry-signature-upload/);
  assert.match(error.body, /Return to the document/);
  assert.doesNotMatch(error.body, /Document Successfully Signed and Uploaded/);
  assert.doesNotMatch(error.body, /data-signer-audit/);
  assert.equal(publish.mod.document, record);
});

test('an accepted server upload shows the success screen and ignores a second click while uploading', async () => {
  const cryptoApp = app();
  cryptoApp.options = { server: { endpoint: { protocol: 'https', host: 'sign.example', port: 443 } } };
  const record = await finalizedRecord(cryptoApp);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const stages = [];
  const { publish, opened } = uploader(cryptoApp, record, async (onStage) => {
    calls += 1;
    onStage('upload');
    stages.push(publish.state.uploadStage);
    onStage('confirm');
    stages.push(publish.state.uploadStage);
    return gate;
  });
  publish.mod.share = { id: 'doc-1', token: 'tok-1' };

  const first = publish.uploadCompletedSignatures();
  assert.equal(publish.state.step, 'signature-upload');
  assert.equal(publish.state.uploadStage, 'confirm');
  const preparing = signatureUploadSlide({ uploadStage: 'upload' });
  const confirming = signatureUploadSlide(publish.state);
  assert.equal(preparing.title, 'Uploading your signatures');
  assert.match(preparing.subtitle, /Securely uploading your signed document/);
  assert.equal(confirming.title, 'Confirming your submission');
  assert.match(confirming.subtitle, /successfully received/);
  assert.match(confirming.body, /share-spinner/);
  assert.doesNotMatch(confirming.body, /data-signer-audit/);
  const second = publish.uploadCompletedSignatures();
  assert.equal(calls, 1);
  release({ ok: true, complete: false, already_present: false, notification_attempted: true, notification_failed: false });
  await first;
  await second;

  assert.deepEqual(stages, ['upload', 'confirm']);
  assert.deepEqual(opened, []);
  assert.equal(publish.state.step, 'signature-uploaded');
  assert.equal(publish.state.emailNotice, '');
  assert.equal(publish.state.documentComplete, false);
  assert.match(publish.state.shareLink, /share=doc-1/);
  const success = signatureUploadedSlide(publish.state);
  assert.match(success.body, /fa-circle-check share-mark/);
  assert.match(success.body, /Document Successfully Signed and Uploaded/);
  assert.match(success.body, /once all parties have completed signing/);
  assert.match(success.body, /view-document-status/);
  assert.match(success.body, /Share link/);
  assert.doesNotMatch(success.body, /data-signer-audit/);
  assert.equal(record.users[0].signatures[0].signature, 'local-signature');

  publish.viewUploadedStatus();
  assert.equal(opened.length, 1);
  assert.equal(opened[0].entry, 'signature-complete');
  assert.equal(opened[0].extra.uploaded, true);
});

test('a successful upload with a failed notification stays on the success screen', async () => {
  const cryptoApp = app();
  const record = await finalizedRecord(cryptoApp);
  const { publish, opened } = uploader(cryptoApp, record, async () => ({
    ok: true,
    complete: true,
    notification_attempted: true,
    notification_failed: true
  }));

  await publish.uploadCompletedSignatures();

  assert.deepEqual(opened, []);
  assert.equal(publish.state.step, 'signature-uploaded');
  assert.equal(publish.state.uploaded, true);
  assert.equal(publish.state.documentComplete, true);
  assert.equal(publish.state.emailNotice, EMAIL_DELIVERY_NOTICE);
  const success = signatureUploadedSlide(publish.state);
  assert.match(success.body, /could not send the notification emails/);
  assert.match(success.body, /uploaded successfully/);
  assert.doesNotMatch(success.body, /Upload not confirmed/);
  assert.doesNotMatch(success.body, /all parties have provided their signatures/);
});

function shareHarness() {
  const publish = {
    state: { step: 'share-progress', history: ['ready'] },
    overlay: { show() {} },
    attachEvents() {},
    paintSlide() {},
    showStep() {},
    app: {},
    mod: { document: {} }
  };
  return new ShareFlow(publish);
}

test('a fast document share keeps the progress overlay until three seconds have passed', async () => {
  const flow = shareHarness();
  const view = flow.view();
  view.startedAt = Date.now();
  view.outcome = 'working';
  const started = Date.now();
  const pending = flow.finishInvite({ success: true, link: 'https://saito.example/share/abc' }, '');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(view.outcome, 'working');
  assert.equal(flow.publish.state.step, 'share-progress');
  await pending;
  assert.ok(Date.now() - started >= 2900);
  assert.equal(view.outcome, 'success');
  assert.equal(flow.publish.state.step, 'share-sent');
});

test('a document share that already exceeded three seconds shows its result without extra delay', async () => {
  const flow = shareHarness();
  const view = flow.view();
  view.startedAt = Date.now() - 4000;
  view.outcome = 'working';
  const started = Date.now();
  await flow.finishInvite({ success: false, error: 'mail failed' }, 'https://saito.example/share/abc');
  assert.ok(Date.now() - started < 500);
  assert.equal(view.outcome, 'stored');
  assert.equal(flow.publish.state.step, 'share-sent');
});

test('a failed document upload stays on progress until the minimum, then shows the error', async () => {
  const flow = shareHarness();
  const view = flow.view();
  view.startedAt = Date.now();
  view.outcome = 'working';
  view.detail = 'Sending your document to the sharing server...';
  const pending = flow.failStage(
    'Sending your document to the sharing server',
    'The sharing server did not confirm that the document was stored.'
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(view.outcome, 'working');
  assert.equal(view.error, '');
  await pending;
  assert.equal(view.outcome, 'failed');
  assert.match(view.error, /did not confirm that the document was stored/);
  assert.equal(flow.publish.state.step, 'share-progress');
  assert.notEqual(view.outcome, 'success');
});

test('a fast signature upload keeps the progress overlay until three seconds have passed', async () => {
  const cryptoApp = app();
  const record = await finalizedRecord(cryptoApp);
  const { publish } = uploader(cryptoApp, record, async () => ({ ok: true, complete: false }));
  const started = Date.now();
  const pending = publish.uploadCompletedSignatures();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(publish.state.step, 'signature-upload');
  assert.equal(publish.state.uploaded, false);
  await pending;
  assert.ok(Date.now() - started >= 2900);
  assert.equal(publish.state.step, 'signature-uploaded');
});

test('a slow signature upload is not delayed for another three seconds', async () => {
  const cryptoApp = app();
  const record = await finalizedRecord(cryptoApp);
  const started = Date.now();
  const { publish } = uploader(cryptoApp, record, async () => {
    await new Promise((resolve) => setTimeout(resolve, 3200));
    return { ok: true, complete: false };
  });
  await publish.uploadCompletedSignatures();
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 3100);
  assert.ok(elapsed < 4500);
  assert.equal(publish.state.step, 'signature-uploaded');
});

test('a failed signature upload shows the error after the progress minimum', async () => {
  const cryptoApp = app();
  const record = await finalizedRecord(cryptoApp);
  const { publish } = uploader(cryptoApp, record, async () => ({ ok: false, error: TIMEOUT }));
  const pending = publish.uploadCompletedSignatures();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(publish.state.step, 'signature-upload');
  assert.equal(publish.state.uploadError, '');
  await pending;
  assert.match(publish.state.uploadError, /Nothing new was confirmed/);
  assert.equal(publish.state.step, 'signature-upload');
  assert.equal(publish.state.uploaded, false);
  assert.notEqual(publish.state.step, 'signature-uploaded');
});

test('the signing Continue button is disabled while an upload is in progress', () => {
  const html = workspaceTemplate.rail({
    finalized: true,
    verified: false,
    signing_ready: true,
    uploading: true,
    field_list: [],
    guide: 'Review the document and provide your signature where needed.',
    file_name: 'Agreement.pdf',
    notice: 'Uploading your signatures.'
  });
  assert.match(html, /data-export disabled/);
  assert.match(html, /Uploading your signatures/);
});
