const assert = require('node:assert/strict');
const test = require('node:test');
const { DRAFT_KEY, loadDraft, saveDraft } = require('../../../mods/nftstudio/lib/draft-store');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('round-trips a versioned plaintext draft', () => {
  const storage = memoryStorage();
  const saved = saveDraft(storage, {
    title: 'Demo',
    type: 'css',
    source: '.nft { color: green; }'
  });

  assert.deepEqual(loadDraft(storage), saved);
  assert.match(storage.getItem(DRAFT_KEY), /color: green/);
});

test('ignores malformed and unsupported drafts', () => {
  const storage = memoryStorage();
  storage.setItem(DRAFT_KEY, '{');
  assert.equal(loadDraft(storage), null);

  storage.setItem(DRAFT_KEY, JSON.stringify({ version: 2 }));
  assert.equal(loadDraft(storage), null);
});
