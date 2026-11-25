const { availableChoices, isTestableQuestion } = require('./hsk-archive');

class HskSession {
  constructor(questions) {
    const rows = Array.isArray(questions) ? questions : [];
    this.questions = rows.filter(isTestableQuestion);
    this.skipped = rows.length - this.questions.length;
    this.index = 0;
    this.correctCount = 0;
    this.answered = 0;
    this.locked = false;
  }

  current() {
    return this.questions[this.index] || null;
  }

  total() {
    return this.questions.length;
  }

  finished() {
    return this.index >= this.questions.length;
  }

  answer(choice) {
    const question = this.current();
    if (!question || this.locked) {
      return null;
    }
    const correctChoice = Number(question.correct);
    const correct = Number(choice) === correctChoice;
    this.locked = true;
    this.answered += 1;
    if (correct) {
      this.correctCount += 1;
    }
    return {
      correct,
      correctChoice,
      explanation: question.explanation || ''
    };
  }

  advance() {
    if (!this.locked) {
      return this.current();
    }
    this.locked = false;
    this.index += 1;
    return this.current();
  }

  choices() {
    return availableChoices(this.current());
  }
}

module.exports = HskSession;
