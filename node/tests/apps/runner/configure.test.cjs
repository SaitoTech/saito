const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configure } = require('../../../apps/runner/configure');
const { loadConfig } = require('../../../apps/runner/config');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function legacy(root, name, extra = {}) {
  const input = { peer: 'wss://saito.io/wsopen', game: 'Conquest',
    dataDir: './runner-data/' + name, decisionProvider: { type: 'codex', executable: 'codex' }, ...extra };
  const file = path.join(root, name + '.json');
  fs.writeFileSync(file, JSON.stringify(input));
  return file;
}

test('new configs live under config while wallets stay outside it', t => {
  const root = fixture(t);
  const files = configure(root, ['daemon', 'conquest', 'settlers', 'twilight', 'paths', 'multi']);
  assert.equal(files.length, 6);
  for (const file of files) {
    assert.equal(path.dirname(file), path.join(root, 'config'));
    assert.ok(loadConfig(file).dataDir.startsWith(path.join(root, 'runner-data') + path.sep));
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
});

test('migration preserves wallet, customized settings and relative executables through old and new paths', t => {
  const root = fixture(t);
  const source = legacy(root, 'daemon', { dataDir: './apps/runner/runner-data/daemon',
    decisionProvider: { type: 'codex', executable: './tools/codex' },
    daemon: { games: ['PathsOfGlory'], mode: 'ask' } });
  const before = loadConfig(source);
  fs.mkdirSync(before.dataDir, { recursive: true });
  const wallet = path.join(before.dataDir, 'options.json');
  fs.writeFileSync(wallet, 'existing wallet and games');
  const [target] = configure(root);
  assert.ok(fs.lstatSync(source).isSymbolicLink());
  assert.deepEqual(loadConfig(target), before);
  assert.deepEqual(loadConfig(source), before);
  assert.equal(fs.readFileSync(wallet, 'utf8'), 'existing wallet and games');
  const edited = JSON.parse(fs.readFileSync(target));
  edited.daemon.games.push('Twilight');
  fs.writeFileSync(target, JSON.stringify(edited));
  configure(root);
  assert.deepEqual(JSON.parse(fs.readFileSync(target)), edited);
  assert.deepEqual(JSON.parse(fs.readFileSync(source)), edited);
});

test('default migration picks up existing root game and multi configs without creating unused ones', t => {
  const root = fixture(t);
  for (const name of ['multi', 'paths']) legacy(root, name);
  assert.deepEqual(configure(root).map(file => path.basename(file)), ['daemon.json', 'paths.json', 'multi.json']);
  assert.ok(!fs.existsSync(path.join(root, 'config/conquest.json')));
});

test('omitted legacy dataDir retains the original default directory', t => {
  const root = fixture(t), source = legacy(root, 'daemon');
  const input = JSON.parse(fs.readFileSync(source)); delete input.dataDir;
  fs.writeFileSync(source, JSON.stringify(input));
  const [target] = configure(root);
  assert.equal(loadConfig(target).dataDir, path.join(root, 'runner-data'));
});

test('conflicting configs and invalid names are rejected without overwriting settings', t => {
  const root = fixture(t);
  const [target] = configure(root);
  const source = legacy(root, 'daemon');
  const original = fs.readFileSync(target, 'utf8');
  assert.throws(() => configure(root), /Both .* exist/);
  assert.equal(fs.readFileSync(target, 'utf8'), original);
  assert.ok(!fs.lstatSync(source).isSymbolicLink());
  assert.throws(() => configure(root, ['../options']), /Unknown runner config/);
});
