const { mapVocabRecord } = require('./vocab-fields');
const { eligibleFormats } = require('./review-formats');

// Existing schedule, with the rank-1 clause that treated every rank-1 word as due removed.
// Rank 0 is always due. Rank 1 waits 2 days, then 6, 13, 28, 57, and 171 days. Rank 7 and above waits.
const INTERVAL_MS = [
  172800 * 1000,
  518400 * 1000,
  1123200 * 1000,
  2419200 * 1000,
  4924800 * 1000,
  14774400 * 1000
];

const SESSION_LENGTH = 5;
const CORRECT_DELAY = 800;
const INCORRECT_DELAY = 1400;

function isDue(word, now = Date.now()) {
  const rank = word.srsRank;
  if (rank <= 0) {
    return true;
  }
  if (rank > INTERVAL_MS.length) {
    return false;
  }
  if (!word.lastStudied) {
    return false;
  }
  return word.lastStudied < now - INTERVAL_MS[rank - 1];
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

class ReviewSession {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.pool = [];
    this.due = [];
    this.remaining = SESSION_LENGTH;
    this.answered = 0;
    this.correctCount = 0;
    this.incorrectCount = 0;
    this.lastFormatId = '';
    this.usedIds = new Set();
    this.current = null;
    this.slots = null;
    this.timer = null;
    this.closed = false;
  }

  async prepare() {
    const records = (await this.mod.returnAllVocabulary()) || [];
    this.pool = records.map(mapVocabRecord).filter((word) => word && word.id != null);
    this.due = this.pool.filter((word) => isDue(word));
    return this;
  }

  traditionalPreferred() {
    const display = this.app.options && this.app.options.popup && this.app.options.popup.display;
    return !!(display && display.traditional == 1);
  }

  selectQuestion() {
    const unseen = this.due.filter((word) => !this.usedIds.has(word.id));
    const source = unseen.length ? unseen : this.due;
    const words = shuffle(source);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let formats = eligibleFormats(word, this.pool);
      if (!formats.length) {
        continue;
      }
      const varied = formats.filter((format) => format.id !== this.lastFormatId);
      if (varied.length) {
        formats = varied;
      }
      const format = formats[Math.floor(Math.random() * formats.length)];
      const model = format.build(word, this.pool, this.traditionalPreferred());
      if (!model) {
        continue;
      }
      this.usedIds.add(word.id);
      this.lastFormatId = format.id;
      return {
        word,
        format,
        model
      };
    }
    return null;
  }

  cancel() {
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async start(slots) {
    this.slots = slots;
    this.closed = false;
    await this.prepare();
    this.showNext();
  }

  showNext() {
    if (this.closed || !this.slots) {
      return;
    }
    if (this.remaining <= 0 || this.answered >= SESSION_LENGTH) {
      this.showFinished();
      return;
    }
    const question = this.selectQuestion();
    if (!question) {
      this.showFinished();
      return;
    }
    this.current = question;
    this.slots.progress.textContent = 'Question ' + (this.answered + 1) + ' of ' + SESSION_LENGTH;
    question.format.render(question.model, this.slots, (response) => {
      this.receive(response);
    });
  }

  async receive(response) {
    if (this.closed || !this.current) {
      return;
    }
    const question = this.current;
    this.current = null;
    const correct = question.format.evaluate(question.model, response);
    if (correct) {
      this.correctCount += 1;
    } else {
      this.incorrectCount += 1;
    }
    this.answered += 1;
    this.remaining -= 1;
    try {
      await this.mod.saveAnswer({
        wid: question.word.id,
        lid: question.word.lessonId,
        correct: correct ? 1 : -1
      });
    } catch (err) {
      console.error(err);
    }
    this.timer = setTimeout(() => this.showNext(), correct ? CORRECT_DELAY : INCORRECT_DELAY);
  }

  showFinished() {
    if (this.closed || !this.slots) {
      return;
    }
    this.slots.progress.textContent = '';
    this.slots.prompt.className = 'review-prompt review-finished-title';
    this.slots.answers.replaceChildren();
    if (this.answered === 0) {
      this.slots.prompt.textContent = 'Nothing is ready to review';
      this.slots.feedback.textContent = this.pool.length < 4
        ? 'Save a few more words from a lesson before starting a multiple-choice review.'
        : 'Nothing is due yet. Recently reviewed words wait out their current interval.';
      return;
    }
    this.slots.prompt.textContent = this.incorrectCount === 0 ? 'Perfect score' : 'Review complete';
    this.slots.feedback.textContent =
      'You answered ' + this.correctCount + ' of ' + this.answered + ' correctly.';
  }
}

module.exports = ReviewSession;
module.exports.isDue = isDue;
module.exports.INTERVAL_MS = INTERVAL_MS;
