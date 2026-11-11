const assert = require('node:assert/strict');
const test = require('node:test');
const shareFlowSlide = require('../../../mods/saitosign/lib/ui/overlays/distribute.template');
const publishTemplate = require('../../../mods/saitosign/lib/ui/overlays/publish.template');

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
  assert.match(failed.body, /data-publish-action="share-backup"/);
  assert.match(success.body, /download a backup/);
  assert.match(success.body, /data-publish-action="share-copy"/);
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
  assert.match(html, /data-publish-action="share-backup"/);
});
