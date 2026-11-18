const { archiveFromLessons, isHskCategory, isTestableQuestion } = require('../../../mods/popup/lib/hsk-archive');
const HskSession = require('../../../mods/popup/lib/hsk-session');

describe('HSK archive', () => {
  const lessons = [
    { id: 3, title: 'Later', userslug: 'hsk-beginner' },
    { id: 1, title: 'First', userslug: 'hsk-beginner' },
    { id: 9, title: 'Story', userslug: 'short-stories' },
    { id: 4, title: 'New', userslug: 'new-hsk-level-1' }
  ];

  test('groups only the existing HSK categories and keeps other lessons out', () => {
    const archive = archiveFromLessons(lessons);
    expect(archive.map((group) => group.slug)).toEqual(['hsk-beginner', 'new-hsk-level-1']);
    expect(archive[0].tests.map((test) => test.id)).toEqual([1, 3]);
    expect(isHskCategory('short-stories')).toBe(false);
    expect(isHskCategory('hsk-advanced')).toBe(true);
  });

  test('accepts a scored multiple-choice question and rejects a question without choices', () => {
    expect(
      isTestableQuestion({
        answer1: 'a',
        answer2: 'b',
        answer3: '',
        answer4: '',
        correct: 2
      })
    ).toBe(true);
    expect(isTestableQuestion({ answer1: 'only', correct: 1 })).toBe(false);
    expect(isTestableQuestion({ answer1: 'a', answer2: 'b', correct: 4 })).toBe(false);
  });
});

describe('HSK test session', () => {
  const questions = [
    { question: 'one', answer1: 'a', answer2: 'b', correct: 1, explanation: 'because' },
    { question: 'written', answer1: '', correct: 0 },
    { question: 'two', answer1: 'c', answer2: 'd', answer3: 'e', correct: 3 }
  ];

  test('uses archived multiple-choice questions in order and scores the recorded answer', () => {
    const session = new HskSession(questions);
    expect(session.total()).toBe(2);
    expect(session.skipped).toBe(1);
    expect(session.current().question).toBe('one');
    expect(session.answer(2)).toEqual({ correct: false, correctChoice: 1, explanation: 'because' });
    expect(session.answer(1)).toBe(null);
    session.advance();
    expect(session.answer(3).correct).toBe(true);
    session.advance();
    expect(session.finished()).toBe(true);
    expect(session.correctCount).toBe(1);
  });
});
