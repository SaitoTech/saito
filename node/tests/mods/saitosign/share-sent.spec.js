const assert = require('node:assert/strict');
const test = require('node:test');
const shareFlowSlide = require('../../../mods/saitosign/lib/ui/overlays/distribute.template');
const publishTemplate = require('../../../mods/saitosign/lib/ui/overlays/publish.template');
const { shareProtectionError } = require('../../../mods/saitosign/lib/share-protocol');

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
  assert.match(slide.body, /Encrypt document with password/);
  assert.doesNotMatch(slide.body, /download a backup/);
  assert.doesNotMatch(`${slide.title} ${slide.subtitle} ${slide.body}`, /separate email-verification|verification email/i);
});

test('password encryption stays on the readiness screen', () => {
  const slide = shareFlowSlide({
    step: 'share-recipients',
    shareView: {
      protect: true,
      password: 'secret',
      confirm: 'secret',
      recipients: [{ name: 'Ada', email: 'ada@example.com', signed: false }]
    }
  });
  assert.match(slide.body, /data-share-password/);
  assert.match(slide.body, /data-share-password-confirm/);
  assert.match(slide.body, /does not have a copy of your password/);
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
      places: 1,
      signed: false,
      creator: true,
      requirements: ['Signature required: all pages']
    }]
  });
  assert.match(html, /<h3 class="title">Digital Signatures Required:<\/h3>/);
  assert.match(html, /Signature required: all pages/);
  assert.match(html, />Not signed</);
  assert.match(html, /data-publish-action="back"/);
  assert.match(html, /<div class="actions"><button type="button" class="saito-button-primary" data-publish-action="ready-yes">Continue<\/button><\/div>/);
  assert.match(html, /On the next page we will prepare the document for all parties to sign/);
  assert.match(html, /<button type="button" class="share-text-link" data-publish-action="ready-sign">click here<\/button>/);
  assert.doesNotMatch(html, /ready-no|status-choice|I'm ready to sign or share|I need to add more signatures|Is this document ready to sign/);
});

test('continue sends the existing invitation', () => {
  const html = publishTemplate({
    step: 'share-recipients',
    history: ['decide-sign'],
    entry: 'prepare',
    shareView: {
      busy: false,
      protect: false,
      recipients: [{ name: 'Ada', email: 'ada@example.com', signed: false }]
    }
  });
  assert.match(html, /Ready to share document\?/);
  assert.match(html, /data-publish-action="share-upload"/);
  assert.match(html, />Continue</);
  assert.doesNotMatch(html, /Send emails/);
  assert.match(html, /data-publish-action="back"/);
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
