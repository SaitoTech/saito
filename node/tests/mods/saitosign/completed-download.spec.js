const assert = require('node:assert/strict');
const PublishOverlay = require('../../../mods/saitosign/lib/ui/overlays/publish');

test('the completed status download calls the existing export', async () => {
  const publish = Object.create(PublishOverlay.prototype);
  const calls = [];
  publish.mod = {
    exportDocument: async () => {
      calls.push('export');
      return { ok: true, filename: 'Agreement.zip' };
    }
  };
  await publish.downloadCompletedDocument();
  assert.deepEqual(calls, ['export']);
});
