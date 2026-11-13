const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../../mods/paths/src/paths-spaces.js'), 'utf8');
const head = source.indexOf('spaceMayReceiveTrench(');
const open = source.indexOf('{', head);
let depth = 0;
let end = -1;
for (let i = open; i < source.length; i++) {
  if (source[i] === '{') { depth++; }
  else if (source[i] === '}') {
    depth--;
    if (depth === 0) { end = i; break; }
  }
}
const spaceMayReceiveTrench = new Function(
  `return function spaceMayReceiveTrench${source.slice(source.indexOf('(', head), end + 1)}`
)();

function board() {
  const spaces = {
    aeubox: { control: 'allies', trench: 0, units: [{ key: 'br_corps' }] },
    ceubox: { control: 'central', trench: 0, units: [{ key: 'ge_corps' }] },
    arbox: { control: 'allies', trench: 0, units: [{ key: 'fr_corps' }] },
    crbox: { control: 'central', trench: 0, units: [{ key: 'ah_corps' }] },
    amiens: { control: 'allies', trench: 0, units: [{ key: 'fr_army' }] },
    essen: { control: 'central', trench: 0, units: [{ key: 'ge_army' }] },
    metz: { control: 'central', trench: 1, units: [{ key: 'ge_army' }] },
    paris: { control: 'allies', trench: 0, units: [] }
  };
  return {
    game: { spaces },
    checkSupplyStatus() { return 1; },
    spaceMayReceiveTrench
  };
}

test('entrench selection ignores both eliminated-unit boxes', () => {
  const mod = board();
  assert.equal(mod.spaceMayReceiveTrench('allies', 'aeubox'), 0);
  assert.equal(mod.spaceMayReceiveTrench('central', 'ceubox'), 0);
  assert.equal(mod.spaceMayReceiveTrench('allies', 'amiens'), 1);
  assert.equal(mod.spaceMayReceiveTrench('central', 'essen'), 1);
});

test('entrench selection still rejects trenches, empty spaces, and the other side', () => {
  const mod = board();
  assert.equal(mod.spaceMayReceiveTrench('central', 'metz'), 0);
  assert.equal(mod.spaceMayReceiveTrench('allies', 'paris'), 0);
  assert.equal(mod.spaceMayReceiveTrench('allies', 'essen'), 0);
  assert.equal(mod.spaceMayReceiveTrench('allies', 'arbox'), 0);
  assert.equal(mod.spaceMayReceiveTrench('central', 'crbox'), 0);
});
