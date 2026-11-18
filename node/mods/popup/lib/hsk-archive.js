const HSK_COLLECTIONS = [
  { slug: 'hsk-beginner', label: 'HSK Beginner', group: 'HSK' },
  { slug: 'hsk-intermediate', label: 'HSK Intermediate', group: 'HSK' },
  { slug: 'hsk-advanced', label: 'HSK Advanced', group: 'HSK' },
  { slug: 'new-hsk-level-1', label: 'New HSK 1', group: 'New HSK' },
  { slug: 'new-hsk-level-2', label: 'New HSK 2', group: 'New HSK' },
  { slug: 'new-hsk-level-3', label: 'New HSK 3', group: 'New HSK' },
  { slug: 'new-hsk-level-4', label: 'New HSK 4', group: 'New HSK' },
  { slug: 'new-hsk-level-5', label: 'New HSK 5', group: 'New HSK' },
  { slug: 'new-hsk-level-6', label: 'New HSK 6', group: 'New HSK' }
];

function isHskCategory(slug) {
  return HSK_COLLECTIONS.some((collection) => collection.slug === slug);
}

function archiveFromLessons(lessons) {
  const rows = Array.isArray(lessons) ? lessons : [];
  return HSK_COLLECTIONS.map((collection) => {
    const tests = rows
      .filter((lesson) => lesson && lesson.userslug === collection.slug)
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id));
    return {
      slug: collection.slug,
      label: collection.label,
      group: collection.group,
      tests
    };
  }).filter((collection) => collection.tests.length > 0);
}

function availableChoices(question) {
  const choices = [];
  if (!question) {
    return choices;
  }
  for (let index = 1; index <= 4; index++) {
    const text = question['answer' + index];
    if (text == null || String(text).trim() === '') {
      continue;
    }
    choices.push({ index, text: String(text) });
  }
  return choices;
}

function isTestableQuestion(question) {
  const choices = availableChoices(question);
  const correct = Number(question && question.correct);
  return choices.length >= 2 && choices.some((choice) => choice.index === correct);
}

module.exports = {
  HSK_COLLECTIONS,
  isHskCategory,
  archiveFromLessons,
  availableChoices,
  isTestableQuestion
};
