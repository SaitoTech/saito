const assert = require('node:assert/strict');
const test = require('node:test');
const shareFlowSlide = require('../../../mods/saitosign/lib/ui/overlays/distribute.template');
const publishTemplate = require('../../../mods/saitosign/lib/ui/overlays/publish.template');
const shareSlide = require('../../../mods/saitosign/lib/ui/overlays/publish.share');
const { shareProtectionError } = require('../../../mods/saitosign/lib/share-protocol');
const { progressHold, PROGRESS_MINIMUM_MS } = shareSlide;

function sent(outcome) {
  return shareFlowSlide({
    step: 'share-sent',
    shareView: {
      outcome,
      link: 'https://saito.example/share/abc',
      copied: false
    }
  });
}

test('the finished share screen is a confirmation without a step title', () => {
  const success = sent('success');
  const failed = sent('stored');
  assert.equal(success.title, '');
  assert.equal(failed.title, '');
  assert.match(success.body, /Your document is safely uploaded and ready to share/);
  assert.match(success.body, /Invitation emails have been sent to your recipients/);
  assert.doesNotMatch(success.body, /could not send the invitation emails/);
  assert.match(failed.body, /SaitoSign could not send the invitation emails/);
  assert.doesNotMatch(failed.body, /Invitation emails have been sent/);
  assert.match(success.body, /available for 2 days, then deleted/);
  assert.doesNotMatch(success.body, /download a backup/);
  assert.doesNotMatch(failed.body, /data-publish-action="share-backup"/);
  assert.match(success.body, /data-publish-action="share-copy"/);
});

test('the readiness screen invites recipients directly', () => {
  const slide = shareFlowSlide({
    step: 'share-recipients',
    shareView: {
      protect: false,
      recipients: [{ name: 'Ada', email: 'ada@example.com', signed: false }]
    }
  });
  assert.equal(slide.title, 'Ready to share document?');
  assert.match(slide.subtitle, /invitation with a link to access this document and verify their email address/);
  assert.match(slide.subtitle, /valid for 2 days/);
  assert.match(slide.subtitle, /delete the document and its associated information/);
  assert.match(slide.body, /ada@example.com/);
  assert.doesNotMatch(slide.body, /Encrypt document with password|data-share-protect|data-share-password/);
  assert.doesNotMatch(slide.body, /download a backup/);
  assert.doesNotMatch(`${slide.title} ${slide.subtitle} ${slide.body}`, /separate email-verification|verification email/i);
});

test('password encryption stays available to the sharing checks', () => {
  const slide = shareFlowSlide({
    step: 'share-password',
    shareView: {
      protect: true,
      password: 'secret',
      confirm: 'secret'
    }
  });
  assert.match(slide.body, /data-share-password/);
  assert.match(slide.body, /data-share-password-confirm/);
  assert.equal(shareProtectionError({ protect: true, password: 'secret', confirm: 'other' }), 'The two passwords do not match. Enter the same password in both fields.');
  assert.equal(shareProtectionError({ protect: true, password: '', confirm: '' }), 'Enter a password, or turn password protection off.');
  assert.equal(shareProtectionError({ protect: true, password: 'secret', confirm: 'secret' }), '');
});

test('the ready screen continues with one footer button', () => {
  const html = publishTemplate({
    step: 'ready',
    history: ['select'],
    signers: [{
      index: 0,
      name: 'Ada',
      email: 'ada@example.com',
      places: 1,
      signed: false,
      creator: true,
      requirements: ['Signature required: all pages']
    }]
  });
  assert.match(html, /<h3 class="title">Digital Signatures Required:<\/h3>/);
  assert.match(html, /Email Address/);
  assert.match(html, /ada@example.com/);
  assert.match(html, /Signature required: all pages/);
  assert.match(html, />Not signed</);
  assert.match(html, /data-publish-action="back"/);
  assert.match(html, /<div class="actions"><button type="button" class="saito-button-primary" data-publish-action="ready-yes">Continue<\/button><\/div>/);
  assert.match(html, /Continue sends an invitation to each email address above/);
  assert.match(html, /<button type="button" class="share-text-link" data-publish-action="ready-sign">click here<\/button>/);
  assert.doesNotMatch(html, /Ready to share document\?|Encrypt document with password|ready-no|status-choice|I'm ready to sign or share|I need to add more signatures|Is this document ready to sign/);
});

test('a failed share is not shown as a successful upload', () => {
  const failed = shareFlowSlide({
    step: 'share-progress',
    shareView: {
      outcome: 'failed',
      error: 'Sending your document to the sharing server: The sharing server did not confirm that the document was stored.'
    }
  });
  assert.match(failed.body, /did not confirm that the document was stored/);
  assert.match(failed.body, /data-publish-action="share-retry-upload"/);
  assert.doesNotMatch(failed.body, /safely uploaded|Invitation emails have been sent/);
});

test('both upload progress overlays stay centered and have no back button', () => {
  const share = publishTemplate({
    step: 'share-progress',
    history: ['ready'],
    shareView: {
      outcome: 'working',
      detail: 'Sending your document to the sharing server...'
    }
  });
  assert.equal(share.includes('data-publish-action="back"'), false);
  assert.equal(share.includes('step-head'), false);
  assert.match(share, /class="share-confirm"/);
  assert.match(share, /Sharing your document/);
  assert.match(share, /Sending your document to the sharing server/);
  assert.match(share, /share-spinner/);

  const signatures = publishTemplate({
    step: 'signature-upload',
    history: ['signature-complete'],
    uploadStage: 'confirm',
    uploadError: ''
  });
  assert.equal(signatures.includes('data-publish-action="back"'), false);
  assert.equal(signatures.includes('step-head'), false);
  assert.match(signatures, /class="share-confirm"/);
  assert.match(signatures, /Confirming your submission/);
  assert.match(signatures, /successfully received/);
  assert.match(signatures, /share-spinner/);
});

test('each progress overlay keeps its own three-second minimum', () => {
  const now = 10000;
  assert.equal(PROGRESS_MINIMUM_MS, 3000);
  assert.equal(progressHold(now - 1000, now), 2000);
  assert.equal(progressHold(now - PROGRESS_MINIMUM_MS, now), 0);
  assert.equal(progressHold(now - 4500, now), 0);
  assert.equal(progressHold(0, now), 0);
  assert.equal(progressHold(now - 2500, now), 500);
  assert.equal(progressHold(now - 200, now), 2800);
});

test('the finished share screen has no back button', () => {
  const html = publishTemplate({
    step: 'share-sent',
    history: ['share-recipients'],
    entry: 'sender',
    shareView: { outcome: 'success', link: 'https://saito.example/share/abc', copied: false }
  });
  assert.equal(html.includes('data-publish-action="back"'), false);
  assert.equal(html.includes('Ready to Sign'), false);
  assert.equal(html.includes('data-publish-action="share-backup"'), false);
});

test('a completed document status downloads the archive instead of asking to share again', () => {
  const completed = shareSlide({
    actionStatus: { required: 1, remaining: 0 },
    signers: [{
      index: 0,
      name: 'Ada',
      email: 'ada@example.com',
      places: 1,
      signed: true,
      creator: true,
      requirements: ['Signature required: page 1']
    }]
  });
  assert.equal(completed.title, 'Document Status');
  assert.match(completed.body, /<th>Signer<\/th>/);
  assert.match(completed.body, /<th>Email Address<\/th>/);
  assert.match(completed.body, /<th>Requirement<\/th>/);
  assert.match(completed.body, /<th>Status<\/th>/);
  assert.match(completed.body, /ada@example.com/);
  assert.match(completed.body, /data-signer-audit="0"/);
  assert.match(completed.body, /All required signatures have been completed\. Share the completed document with the people who need it\./);
  assert.match(completed.body, /data-publish-action="download-completed">Download completed document/);
  assert.doesNotMatch(completed.body, /I need to share this document|status-choice/);

  const preparing = shareSlide({
    actionStatus: { required: 2, remaining: 1 },
    signers: []
  });
  assert.match(preparing.body, /data-publish-action="sign-now">I need to sign this document/);
  assert.match(preparing.body, /data-publish-action="skip-sign">I need to share this document/);
  assert.doesNotMatch(preparing.body, /download-completed/);

  const distributing = shareSlide({
    distributeOnly: true,
    actionStatus: { required: 2, remaining: 1 },
    signers: []
  });
  assert.match(distributing.body, /data-publish-action="share">I need to share this document/);
  assert.doesNotMatch(distributing.body, /download-completed/);
});
