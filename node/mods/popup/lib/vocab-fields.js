// Saved vocabulary records keep the lesson column order.
// field1 simplified, field2 traditional, field3 pinyin, field4 English, field5 part of speech.

function mapVocabRecord(record) {
  if (!record) {
    return null;
  }
  return {
    id: record.id,
    simplified: record.field1 || '',
    traditional: record.field2 || '',
    pinyin: record.field3 || '',
    english: record.field4 || '',
    pos: record.field5 || '',
    lessonId: record.lesson_id || 0,
    label: record.label || '',
    srsRank: Number(record.srs_rank) || 0,
    lastStudied: Number(record.last_studied) || 0
  };
}

function displayPinyin(numeric) {
  const value = String(numeric || '');
  if (!value) {
    return '';
  }
  try {
    if (typeof convert_pinyin === 'function') {
      return convert_pinyin(value);
    }
  } catch (err) {}
  return value;
}

function promptChinese(word, traditional) {
  if (!word) {
    return '';
  }
  if (traditional && word.traditional) {
    return word.traditional;
  }
  return word.simplified || word.traditional || '';
}

module.exports = {
  mapVocabRecord,
  displayPinyin,
  promptChinese
};
