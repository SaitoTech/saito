const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { validateSource } = require('../../../mods/nftstudio/lib/validator');
const acorn = require('../../../web/saito/lib/nftstudio/acorn.min');
const csstreeSource = fs.readFileSync(
  require.resolve('../../../web/saito/lib/nftstudio/csstree.min'),
  'utf8'
);
const csstree = vm.runInNewContext(`${csstreeSource}\n;csstree`, Object.create(null));
const parsers = { acorn, csstree };

test('accepts JavaScript supported by the NFT async function body', () => {
  assert.equal(validateSource('js', 'await Promise.resolve(); return 1;', parsers).valid, true);
});

test('reports invalid JavaScript with a location', () => {
  const result = validateSource('js', 'const value = ;', parsers);

  assert.equal(result.valid, false);
  assert.equal(result.line, 1);
  assert.equal(result.column, 15);
});

test('accepts a valid CSS stylesheet', () => {
  assert.equal(validateSource('css', '.nft { color: green; }', parsers).valid, true);
});

test('reports unclosed CSS blocks', () => {
  const result = validateSource('css', '.nft { color: green;', parsers);

  assert.equal(result.valid, false);
  assert.match(result.message, /Unclosed/);
  assert.equal(result.line, 1);
});

test('rejects empty source', () => {
  assert.equal(validateSource('js', '  ', parsers).valid, false);
  assert.equal(validateSource('css', '\n', parsers).valid, false);
});
