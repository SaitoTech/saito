jest.mock('localforage', () => {
  const store = new Map();
  const api = {
    store,
    writes: [],
    async setItem(key, value) {
      store.set(key, value);
      api.writes.push({ key, value });
      return value;
    },
    async getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async removeItem(key) {
      store.delete(key);
    },
    async keys() {
      return Array.from(store.keys());
    },
    async clear() {
      store.clear();
    }
  };
  return api;
});

const localforage = require('localforage');
const Storage = require('../../../../lib/saito/storage').default;

function browserStorage(games) {
  const app = {
    BROWSER: 1,
    options: {
      wallet: { publicKey: 'pubkey' },
      games: games
    }
  };
  return new Storage(app);
}

beforeEach(() => {
  localforage.store.clear();
  localforage.writes.length = 0;
});

test('startup keeps a newer data file when embedded options are stale and unindexed', async () => {
  const id = 'stale-game';
  const newer = { id: id, module: 'Chess', timestamp: 999, note: 'new' };
  localforage.store.set('datafile:games:' + id, JSON.stringify(newer));
  const storage = browserStorage([{ id: id, module: 'Chess', timestamp: 1, note: 'stale' }]);

  await storage.readExternalRecords();

  expect(JSON.parse(localforage.store.get('datafile:games:' + id))).toEqual(newer);
  expect(localforage.writes).toEqual([]);
  expect(storage.app.options.games).toEqual([newer]);
  expect(storage.app.options.external_game_ids).toBeUndefined();
});

test('startup copies an embedded game only when its data file is missing', async () => {
  const embedded = { id: 'only-embedded', module: 'Chess', timestamp: 4, note: 'embedded' };
  const storage = browserStorage([embedded]);

  await storage.readExternalRecords();

  expect(JSON.parse(localforage.store.get('datafile:games:only-embedded'))).toEqual(embedded);
  expect(storage.app.options.games).toEqual([embedded]);
});

test('a damaged data file is not replaced by stale embedded game data', async () => {
  const id = 'damaged-game';
  localforage.store.set('datafile:games:' + id, '{');
  const storage = browserStorage([{ id: id, module: 'Chess', timestamp: 1, note: 'stale' }]);

  await storage.readExternalRecords();

  expect(localforage.store.get('datafile:games:' + id)).toBe('{');
  expect(localforage.writes).toEqual([]);
  expect(storage.app.options.games).toEqual([]);
});
