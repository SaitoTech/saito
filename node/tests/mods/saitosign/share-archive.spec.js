const assert = require('node:assert/strict');
const test = require('node:test');
const { hydrate } = require('../../../mods/saitosign/lib/document');
const { serializeDocument, DocumentStoreError } = require('../../../mods/saitosign/lib/database');

test('an empty SaitoSign zip is rejected instead of being stored as a blank document', () => {
  assert.throws(
    () => serializeDocument({ format: 'saitosign-zip', archive: '' }),
    (err) => err instanceof DocumentStoreError && err.message === 'The SaitoSign document archive is empty.'
  );
  const stored = JSON.parse(serializeDocument({ format: 'saitosign-zip', archive: 'abc' }));
  assert.deepEqual(stored, { format: 'saitosign-zip', archive: 'abc' });
});

test('opening a stored document with no PDF says the document did not contain one', async () => {
  await assert.rejects(
    () => hydrate({ document: { pdf: [] }, users: [], actions: [] }),
    { message: 'The stored document did not contain a PDF.' }
  );
  await assert.rejects(
    () => hydrate({ document: { pdf: [{ name: 'blank.pdf', pdf: '   ' }] }, users: [], actions: [] }),
    { message: 'The stored document did not contain a PDF.' }
  );
});

test('opening PDF bytes that are not a PDF still reports that', async () => {
  const pdf = Buffer.from('hello').toString('base64');
  await assert.rejects(
    () => hydrate({ document: { pdf: [{ name: 'note.pdf', pdf }] }, users: [], actions: [] }),
    { message: 'not a pdf' }
  );
});
