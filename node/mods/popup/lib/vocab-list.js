const { displayPinyin } = require('./vocab-fields');

const PAGE_SIZES = [10, 25, 50, 100];

const DISPLAY_FIELDS = [
  { key: 'simplified', label: 'Simplified', record: 'field1', chinese: true },
  { key: 'traditional', label: 'Traditional', record: 'field2', chinese: true },
  { key: 'pinyin', label: 'Pinyin', record: 'field3', chinese: false },
  { key: 'english', label: 'English', record: 'field4', chinese: false },
  { key: 'pos', label: 'Part of speech', record: 'field5', chinese: false },
  { key: 'srs_rank', label: 'SRS rank', stat: true },
  { key: 'times_correct', label: 'Correct', stat: true },
  { key: 'times_incorrect', label: 'Incorrect', stat: true },
  { key: 'last_studied', label: 'Last studied', stat: true }
];

const SORTS = [
  { key: 'simplified', label: 'Simplified' },
  { key: 'traditional', label: 'Traditional' },
  { key: 'pinyin', label: 'Pinyin' },
  { key: 'english', label: 'English' },
  { key: 'pos', label: 'Part of speech' },
  { key: 'srs_rank', label: 'SRS rank' },
  { key: 'times_correct', label: 'Correct' },
  { key: 'times_incorrect', label: 'Incorrect' },
  { key: 'last_studied', label: 'Last studied' }
];

const DEFAULT_PREFS = {
  simplified: 1,
  traditional: 0,
  pinyin: 1,
  english: 1,
  pos: 0,
  srs_rank: 0,
  times_correct: 0,
  times_incorrect: 0,
  last_studied: 0
};

function listPrefs(app) {
  const stored = app && app.options && app.options.popup && app.options.popup.vocab_list;
  return Object.assign({}, DEFAULT_PREFS, stored || {});
}

function visibleFields(prefs) {
  return DISPLAY_FIELDS.filter((field) => Number(prefs[field.key]) === 1);
}

function readSortValue(record, key) {
  if (key === 'simplified') {
    return record.field1 || '';
  }
  if (key === 'traditional') {
    return record.field2 || '';
  }
  if (key === 'pinyin') {
    return record.field3 || '';
  }
  if (key === 'english') {
    return record.field4 || '';
  }
  if (key === 'pos') {
    return record.field5 || '';
  }
  if (key === 'srs_rank') {
    return Number(record.srs_rank) || 0;
  }
  if (key === 'times_correct') {
    return Number(record.times_correct) || 0;
  }
  if (key === 'times_incorrect') {
    return Number(record.times_incorrect) || 0;
  }
  if (key === 'last_studied') {
    return Number(record.last_studied) || 0;
  }
  return record.field1 || '';
}

function isMissing(key, value) {
  if (key === 'last_studied') {
    return !value;
  }
  if (key === 'srs_rank' || key === 'times_correct' || key === 'times_incorrect') {
    return false;
  }
  return !String(value || '').trim();
}

function sortVocabulary(records, key, direction) {
  const sortKey = SORTS.some((item) => item.key === key) ? key : 'simplified';
  const numeric =
    sortKey === 'srs_rank' ||
    sortKey === 'times_correct' ||
    sortKey === 'times_incorrect' ||
    sortKey === 'last_studied';
  const factor = direction === 'desc' ? -1 : 1;
  const locale = sortKey === 'english' || sortKey === 'pinyin' ? 'en' : 'zh';

  return records.slice().sort((a, b) => {
    const av = readSortValue(a, sortKey);
    const bv = readSortValue(b, sortKey);
    const aMissing = isMissing(sortKey, av);
    const bMissing = isMissing(sortKey, bv);
    if (aMissing !== bMissing) {
      return aMissing ? 1 : -1;
    }
    let cmp = 0;
    if (numeric) {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv), locale);
    }
    if (cmp === 0) {
      cmp = (Number(a.id) || 0) - (Number(b.id) || 0);
    }
    return cmp * factor;
  });
}

function pageWindow(records, page, pageSize) {
  const size = PAGE_SIZES.indexOf(pageSize) === -1 ? 25 : pageSize;
  const total = records.length;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(Math.max(0, page), pages - 1);
  const start = total === 0 ? 0 : current * size;
  const rows = records.slice(start, start + size);
  return {
    page: current,
    pages,
    start,
    end: start + rows.length,
    rows,
    total,
    pageSize: size
  };
}

function idsBetween(records, fromId, toId) {
  const from = Number(fromId);
  const to = Number(toId);
  const start = records.findIndex((record) => Number(record.id) === from);
  const end = records.findIndex((record) => Number(record.id) === to);
  if (start < 0 || end < 0) {
    return [];
  }
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  return records.slice(low, high + 1).map((record) => Number(record.id));
}

function formatStudied(value) {
  const time = Number(value) || 0;
  if (!time) {
    return '';
  }
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString();
}

function cellText(record, field) {
  if (field.key === 'pinyin') {
    return displayPinyin(record.field3 || '');
  }
  if (field.key === 'srs_rank') {
    return String(Number(record.srs_rank) || 0);
  }
  if (field.key === 'times_correct') {
    return String(Number(record.times_correct) || 0);
  }
  if (field.key === 'times_incorrect') {
    return String(Number(record.times_incorrect) || 0);
  }
  if (field.key === 'last_studied') {
    return formatStudied(record.last_studied);
  }
  return record[field.record] || '';
}

function introductorySeedNeeded(count, seeded) {
  return Number(count) === 0 && !seeded;
}

module.exports = {
  PAGE_SIZES,
  DISPLAY_FIELDS,
  SORTS,
  DEFAULT_PREFS,
  listPrefs,
  visibleFields,
  sortVocabulary,
  pageWindow,
  idsBetween,
  cellText,
  introductorySeedNeeded
};
