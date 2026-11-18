const {
  sortVocabulary,
  pageWindow,
  idsBetween,
  visibleFields
} = require('../../../mods/popup/lib/vocab-list');
const ReviewSession = require('../../../mods/popup/lib/review-session');

function word(id, fields) {
  return Object.assign(
    {
      id,
      field1: '',
      field2: '',
      field3: '',
      field4: '',
      field5: '',
      srs_rank: 0,
      times_correct: 0,
      times_incorrect: 0,
      last_studied: 0
    },
    fields
  );
}

describe('vocabulary list ordering', () => {
  const records = [
    word(3, { field1: 'm', field4: 'I', srs_rank: 2, times_correct: 1, last_studied: 50 }),
    word(1, { field1: '', field4: 'missing', srs_rank: 0, times_correct: 4, last_studied: 0 }),
    word(2, { field1: 'a', field4: 'you', srs_rank: 2, times_correct: 1, last_studied: 10 })
  ];

  test('sorts the whole collection and keeps missing text last in both directions', () => {
    const ascending = sortVocabulary(records, 'simplified', 'asc').map((row) => row.id);
    const descending = sortVocabulary(records, 'simplified', 'desc').map((row) => row.id);
    expect(ascending).toEqual([2, 3, 1]);
    expect(descending).toEqual([3, 2, 1]);
    expect(ascending[ascending.length - 1]).toBe(1);
    expect(descending[descending.length - 1]).toBe(1);
  });

  test('sorts study counters numerically and leaves an unstudied word last', () => {
    expect(sortVocabulary(records, 'times_correct', 'asc').map((row) => row.id)).toEqual([2, 3, 1]);
    expect(sortVocabulary(records, 'srs_rank', 'asc').map((row) => row.id)).toEqual([1, 2, 3]);
    expect(sortVocabulary(records, 'last_studied', 'asc').map((row) => row.id)).toEqual([2, 3, 1]);
    expect(sortVocabulary(records, 'last_studied', 'desc').map((row) => row.id)).toEqual([3, 2, 1]);
  });

  test('breaks ties by record id', () => {
    const tied = [word(8, { field4: 'same' }), word(4, { field4: 'same' })];
    expect(sortVocabulary(tied, 'english', 'asc').map((row) => row.id)).toEqual([4, 8]);
    expect(sortVocabulary(tied, 'english', 'desc').map((row) => row.id)).toEqual([8, 4]);
  });

  test('pages the sorted collection and stays in range', () => {
    const many = [];
    for (let i = 0; i < 12; i++) {
      many.push(word(i + 1, { field1: String.fromCharCode(97 + i) }));
    }
    const sorted = sortVocabulary(many, 'simplified', 'asc');
    const first = pageWindow(sorted, 0, 10);
    expect(first.rows).toHaveLength(10);
    expect(first.end).toBe(10);
    const past = pageWindow(sorted, 9, 10);
    expect(past.page).toBe(1);
    expect(past.rows).toHaveLength(2);
    expect(pageWindow(sorted, 0, 7).pageSize).toBe(25);
  });

  test('selects a shift range by id in the current sort, not by a stale position', () => {
    const ascending = sortVocabulary(records, 'simplified', 'asc');
    expect(idsBetween(ascending, 2, 1)).toEqual([2, 3, 1]);
    const descending = sortVocabulary(records, 'simplified', 'desc');
    expect(idsBetween(descending, 3, 1)).toEqual([3, 2, 1]);
  });

  test('hides a display field without leaving it in the row', () => {
    const fields = visibleFields({
      simplified: 1,
      traditional: 0,
      pinyin: 1,
      english: 1,
      pos: 0
    });
    expect(fields.map((field) => field.key)).toEqual(['simplified', 'pinyin', 'english']);
  });

  test('starts from simplified, pinyin, and English unless a preference is already stored', () => {
    const { DEFAULT_PREFS, listPrefs, introductorySeedNeeded } = require('../../../mods/popup/lib/vocab-list');
    expect(visibleFields(DEFAULT_PREFS).map((field) => field.key)).toEqual([
      'simplified',
      'pinyin',
      'english'
    ]);
    const stored = listPrefs({
      options: {
        popup: {
          vocab_list: {
            simplified: 1,
            traditional: 1,
            pinyin: 1,
            english: 0
          }
        }
      }
    });
    expect(visibleFields(stored).map((field) => field.key)).toEqual([
      'simplified',
      'traditional',
      'pinyin'
    ]);
    expect(introductorySeedNeeded(0, 0)).toBe(true);
    expect(introductorySeedNeeded(0, 1)).toBe(false);
    expect(introductorySeedNeeded(3, 0)).toBe(false);
  });
});

describe('selected vocabulary review', () => {
  function sessionFor(records) {
    return new ReviewSession(
      {},
      {
        returnAllVocabulary: async () => records
      }
    );
  }

  const records = [
    word(1, { field1: '我', field4: 'I', srs_rank: 5, last_studied: Date.now() }),
    word(2, { field1: '你', field4: 'you', srs_rank: 0, last_studied: 0 }),
    word(3, { field1: '他', field4: 'he', srs_rank: 0, last_studied: 0 })
  ];

  test('uses the full due collection when no selection is passed', async () => {
    const session = sessionFor(records);
    await session.prepare();
    expect(session.pool.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(session.due.map((row) => row.id)).toEqual([2, 3]);
  });

  test('limits questions to the selected ids and keeps the full pool for choices', async () => {
    const session = sessionFor(records);
    session.onlyIds = new Set([1]);
    await session.prepare();
    expect(session.pool.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(session.due.map((row) => row.id)).toEqual([1]);
  });
});
