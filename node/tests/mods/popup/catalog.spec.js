const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const PopupCatalog = require('../../../mods/popup/lib/catalog');

const database = path.join(__dirname, '../../../data/popup.sq3');

function loadCatalog() {
  const rows = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `
import json, sqlite3, sys
sql = sys.stdin.read()
connection = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)
connection.row_factory = sqlite3.Row
print(json.dumps([dict(row) for row in connection.execute(sql)]))
`,
        database
      ],
      { input: PopupCatalog.query(), encoding: 'utf8' }
    )
  );
  const catalog = new PopupCatalog({}, { sendPeerDatabaseRequestWithFilter() {} });
  catalog.store(rows);
  return catalog;
}

test('catalog loads every restored lesson in publication-date order', () => {
  const catalog = loadCatalog();
  const lessons = catalog.getAll();
  assert.equal(lessons.length, 915);
  for (let i = 1; i < lessons.length; i++) {
    assert.ok(String(lessons[i - 1].pubdate) >= String(lessons[i].pubdate));
  }
  assert.equal(lessons[0].id, 1449);
  assert.equal(lessons[0].title, 'Let me do it, myself');
});

test('category filters keep the restored catalog counts', () => {
  const catalog = loadCatalog();
  const counts = {
    'absolute-beginners': 132,
    elementary: 166,
    intermediate: 167,
    advanced: 70,
    'film-friday': 75,
    'ktv-wednesday': 52,
    'short-stories': 20,
    'hsk-beginner': 83,
    'hsk-intermediate': 70,
    'hsk-advanced': 35,
    'new-hsk-level-1': 8,
    'new-hsk-level-2': 8,
    'new-hsk-level-3': 8,
    'new-hsk-level-4': 8,
    'new-hsk-level-5': 9,
    'new-hsk-level-6': 4
  };
  let newHsk = 0;
  for (const [slug, count] of Object.entries(counts)) {
    const lessons = catalog.getByCategory(slug);
    assert.equal(lessons.length, count, slug);
    if (slug.startsWith('new-hsk-level-')) {
      newHsk += lessons.length;
    }
  }
  assert.equal(newHsk, 45);
  assert.equal(catalog.getByCategory('quiz-night').length, 0);
  assert.equal(catalog.getByCategory('all').length, 915);
});

test('a catalog lesson can be found by id and by its public path', () => {
  const catalog = loadCatalog();
  const lesson = catalog.getBySlug('ktv-wednesday', 'wang-fei-sunshine-baby');
  assert.equal(lesson.id, 5);
  assert.equal(lesson.title, 'Wang Fei - Sunshine Baby');
  assert.equal(catalog.getById(5).slug, 'wang-fei-sunshine-baby');
  assert.equal(catalog.getById('missing').title, 'Placeholder Title');
  assert.equal(catalog.getBySlug('elementary', 'missing'), null);
});

test('load stores the peer response and ignores a repeated lesson id', () => {
  const catalog = new PopupCatalog(
    {},
    {
      sendPeerDatabaseRequestWithFilter(service, sql, callback, filter) {
        assert.equal(service, 'Popup');
        assert.match(sql, /ORDER BY lessons\.pubdate DESC/);
        assert.equal(filter({ publicKey: 'peer' }), 1);
        assert.equal(filter({ publicKey: 'other' }), 0);
        callback({
          rows: [
            { id: 2, title: 'Older', userslug: 'elementary', slug: 'older', pubdate: '2008-01-01 09:00:00' },
            { id: 2, title: 'Duplicate', userslug: 'elementary', slug: 'older', pubdate: '2008-01-01 09:00:00' },
            { id: 3, title: 'Newer', userslug: 'advanced', slug: 'newer', pubdate: '2015-01-01 09:00:00' }
          ]
        });
      }
    }
  );
  let loaded = false;
  catalog.load({ publicKey: 'peer' }, () => {
    loaded = true;
  });
  assert.equal(loaded, true);
  assert.deepEqual(
    catalog.getAll().map((lesson) => lesson.id),
    [3, 2]
  );
  assert.equal(catalog.getByCategory('advanced')[0].title, 'Newer');
});
