const Card = require('../../../mods/twilight/lib/cardgen/card');
const {
  DRAFT_KEY,
  loadDraft,
  saveDraft,
  clearDraft
} = require('../../../mods/twilight/lib/cardgen/draft-store');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => {
      values.set(key, String(value));
    },
    removeItem: (key) => {
      values.delete(key);
    }
  };
}

describe('TSCardGen local draft store', () => {
  test('round-trips card fields including code tabs and image url', () => {
    const storage = memoryStorage();
    const card = new Card({}, {}, {
      title: 'War Games',
      card_id: '123',
      event: 'Do something',
      removed: true,
      image_style: 'logo',
      image_url: 'data:image/png;base64,abc',
      code: 'one();'
    });
    card.addCodeEvent();
    card.events[1].code = 'two();';
    card.active_event_index = 1;

    const { draft } = saveDraft(storage, card.toDraftData());
    expect(draft.version).toBe(1);
    expect(storage.getItem(DRAFT_KEY)).toContain('War Games');

    const loaded = loadDraft(storage);
    expect(loaded.card.title).toBe('War Games');
    expect(loaded.card.card_id).toBe('123');
    expect(loaded.card.events).toHaveLength(2);
    expect(loaded.card.events[0].code).toBe('one();');
    expect(loaded.card.events[1].code).toBe('two();');
    expect(loaded.card.active_event_index).toBe(1);
    expect(loaded.card.image_url).toBe('data:image/png;base64,abc');
    expect(loaded.card.image_style).toBe('logo');
    expect(loaded.card.removed).toBe(true);

    const restored = new Card({}, {}, loaded.card);
    expect(restored.title).toBe('War Games');
    expect(restored.events.map((event) => event.code)).toEqual(['one();', 'two();']);
    expect(restored.active_event_index).toBe(1);
    expect(restored.image_url).toBe('data:image/png;base64,abc');
  });

  test('clearDraft removes the working card cache', () => {
    const storage = memoryStorage();
    saveDraft(storage, { title: 'Old' });
    clearDraft(storage);
    expect(loadDraft(storage)).toBeNull();
  });

  test('ignores malformed drafts', () => {
    const storage = memoryStorage();
    storage.setItem(DRAFT_KEY, '{');
    expect(loadDraft(storage)).toBeNull();

    storage.setItem(DRAFT_KEY, JSON.stringify({ version: 2, card: { title: 'x' } }));
    expect(loadDraft(storage)).toBeNull();
  });

  test('saveDraft throws when storage refuses the write', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
    };
    expect(() => saveDraft(storage, { title: 'Huge' })).toThrow(/QuotaExceededError/);
  });
});
