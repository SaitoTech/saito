import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import StorageCore from '../../../../lib/saito/core/storage-core';

function storageIn(dir) {
  const storage = new StorageCore({ options: { games: [{ id: 'should-not-be-written' }] } }, dir);
  return storage;
}

test('data files round-trip under data_dir and stay inside it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saito-data-file-'));
  const storage = storageIn(dir);

  expect(await storage.loadDataFile('games', 'abc')).toBeNull();
  await storage.saveDataFile('games', 'abc', '{"id":"abc","n":1}');
  expect(fs.existsSync(path.join(dir, 'games', 'abc.json'))).toBe(true);
  expect(await storage.loadDataFile('games', 'abc')).toEqual({ id: 'abc', n: 1 });

  await storage.saveDataFile('games', 'abc', '{"id":"abc","n":2}');
  expect(await storage.loadDataFile('games', 'abc')).toEqual({ id: 'abc', n: 2 });
  expect(fs.readdirSync(path.join(dir, 'games')).filter((name) => name.endsWith('.tmp'))).toEqual(
    []
  );

  expect(await storage.deleteDataFile('games', 'abc')).toBe(true);
  expect(await storage.loadDataFile('games', 'abc')).toBeNull();
  expect(await storage.deleteDataFile('games', 'missing')).toBe(false);

  await expect(storage.saveDataFile('../etc', 'abc', '{}')).rejects.toThrow(/namespace/);
  await expect(storage.saveDataFile('games', '../abc', '{}')).rejects.toThrow(/id/);
  await expect(storage.loadDataFile('games', '.hidden')).rejects.toThrow(/id/);

  fs.removeSync(dir);
});

test('damaged game json is not reported as a missing game', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saito-data-file-'));
  const storage = storageIn(dir);
  const record = path.join(dir, 'games');
  fs.mkdirpSync(record);
  fs.writeFileSync(path.join(record, 'broken.json'), '{');

  let thrown = null;
  try {
    await storage.loadDataFile('games', 'broken');
  } catch (err) {
    thrown = err;
  }
  expect(String(thrown && (thrown.message || thrown))).toContain('Bad object');

  fs.removeSync(dir);
});

test('returnOptionsForSaving omits games when the wallet is not encrypted', () => {
  const previous = process.env.SAITO_PASS;
  delete process.env.SAITO_PASS;
  try {
    const storage = storageIn(os.tmpdir());
    const saved = storage.returnOptionsForSaving();
    expect(saved.games).toBeUndefined();
    expect(storage.app.options.games).toEqual([{ id: 'should-not-be-written' }]);
  } finally {
    if (previous === undefined) {
      delete process.env.SAITO_PASS;
    } else {
      process.env.SAITO_PASS = previous;
    }
  }
});
