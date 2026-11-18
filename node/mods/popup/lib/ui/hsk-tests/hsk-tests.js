const HskSession = require('../../hsk-session');
const { archiveFromLessons } = require('../../hsk-archive');
const { archive, runner } = require('./hsk-tests.template');

class HskTests {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.waiting = false;
    this.selectedId = null;
    this.session = null;
    this.active = false;
  }

  render() {
    this.active = true;
    this.session = null;
    if (this.mod.main && this.mod.main.showApplicationView) {
      this.mod.main.showApplicationView('catalog');
    }
    const main = document.querySelector('.saito-main');
    if (!main) {
      return;
    }
    if (this.mod.manager && this.mod.manager.showMenu) {
      this.mod.manager.waiting_to_display = false;
      this.mod.manager.showMenu('hsk-test');
    }
    main.innerHTML = '';
    const lessons = this.mod.catalog ? this.mod.catalog.getAll() : [];
    if (!lessons.length) {
      this.waiting = true;
      main.innerHTML = archive([], null);
      return;
    }
    this.waiting = false;
    this.drawArchive();
  }

  drawArchive() {
    const main = document.querySelector('.saito-main');
    if (!main) {
      return;
    }
    const groups = archiveFromLessons(this.mod.catalog.getAll());
    if (this.selectedId && !groups.some((group) => group.tests.some((test) => Number(test.id) === Number(this.selectedId)))) {
      this.selectedId = null;
    }
    main.innerHTML = archive(groups, this.selectedId);
    this.attachArchiveEvents();
  }

  attachArchiveEvents() {
    const root = document.querySelector('.popup-hsk');
    if (!root) {
      return;
    }
    root.addEventListener('click', (event) => {
      const test = event.target.closest('.popup-hsk-test');
      if (test) {
        this.selectedId = Number(test.dataset.lessonId);
        this.drawArchive();
        return;
      }
      const start = event.target.closest('[data-action="start"]');
      if (start && !start.disabled) {
        this.startSelected();
      }
    });
  }

  selectedLesson() {
    const lessons = this.mod.catalog.getAll();
    return lessons.find((lesson) => Number(lesson.id) === Number(this.selectedId)) || null;
  }

  async startSelected() {
    const lesson = this.selectedLesson();
    const notice = document.querySelector('.popup-hsk-notice');
    if (!lesson) {
      if (notice) {
        notice.textContent = 'Choose a test from the archive first.';
      }
      return;
    }
    if (notice) {
      notice.textContent = '';
    }
    const questions = await this.mod.loadQuestions(lesson.id);
    this.session = new HskSession(questions);
    if (!this.session.total()) {
      if (notice) {
        notice.textContent = 'This archived test has no multiple-choice questions that can be scored.';
      }
      this.session = null;
      return;
    }
    this.drawRunner(lesson);
  }

  drawRunner(lesson) {
    const main = document.querySelector('.saito-main');
    if (!main || !this.session) {
      return;
    }
    main.innerHTML = runner();
    const root = main.querySelector('.popup-hsk-runner');
    root.dataset.lessonId = String(lesson.id);
    root.dataset.title = lesson.title || '';
    this.showQuestion(lesson);
    root.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-choice]');
      if (choice && !choice.disabled) {
        this.choose(Number(choice.dataset.choice));
        return;
      }
      if (event.target.closest('[data-action="next"]')) {
        this.session.advance();
        this.showQuestion(lesson);
        return;
      }
      if (event.target.closest('[data-action="archive"]')) {
        this.session = null;
        this.drawArchive();
      }
    });
  }

  showQuestion(lesson) {
    const root = document.querySelector('.popup-hsk-runner');
    if (!root || !this.session) {
      return;
    }
    const progress = root.querySelector('.popup-hsk-progress');
    const questionEl = root.querySelector('.popup-hsk-question');
    const choicesEl = root.querySelector('.popup-hsk-choices');
    const feedback = root.querySelector('.popup-hsk-feedback');
    const next = root.querySelector('[data-action="next"]');
    feedback.textContent = '';
    feedback.className = 'popup-hsk-feedback';
    next.hidden = true;

    if (this.session.finished()) {
      progress.textContent = lesson.title || 'HSK Test';
      questionEl.innerHTML = `<h1>Test complete</h1><p>You answered ${this.session.correctCount} of ${this.session.total()} correctly.</p>`;
      choicesEl.innerHTML = '';
      if (this.session.skipped) {
        feedback.textContent =
          this.session.skipped +
          (this.session.skipped === 1 ? ' archived question was' : ' archived questions were') +
          ' left out because ' +
          (this.session.skipped === 1 ? 'it has' : 'they have') +
          ' no scored multiple-choice answers.';
      }
      return;
    }

    const question = this.session.current();
    progress.textContent =
      (lesson.title || 'HSK Test') + ' · ' + (this.session.index + 1) + ' of ' + this.session.total();
    const audio = question.audio
      ? `<button type="button" class="popup-vocab-play" data-audio="https://popupchinese.com/data/${Number(lesson.id)}/mp3/${String(question.audio).replace(/"/g, '')}" aria-label="Play question audio"><img src="/popup/img/buttons/play_button.gif" alt=""></button>`
      : '';
    questionEl.innerHTML = `${audio}<div class="popup-hsk-prompt">${question.question || ''}</div>`;
    if (audio) {
      const play = questionEl.querySelector('[data-audio]');
      play.addEventListener('click', () => {
        if (typeof playWordAudio === 'function') {
          playWordAudio(play.dataset.audio, play);
        }
      });
    }
    choicesEl.innerHTML = this.session
      .choices()
      .map((choice) => {
        return `<button type="button" class="popup-hsk-choice" data-choice="${choice.index}">${choice.text}</button>`;
      })
      .join('');
  }

  choose(choice) {
    const result = this.session.answer(choice);
    if (!result) {
      return;
    }
    const root = document.querySelector('.popup-hsk-runner');
    root.querySelectorAll('.popup-hsk-choice').forEach((button) => {
      const index = Number(button.dataset.choice);
      button.disabled = true;
      if (index === result.correctChoice) {
        button.classList.add('is-correct');
      } else if (index === choice && !result.correct) {
        button.classList.add('is-incorrect');
      }
    });
    const feedback = root.querySelector('.popup-hsk-feedback');
    feedback.textContent = result.correct ? 'Correct' : 'Incorrect';
    feedback.classList.add(result.correct ? 'is-correct' : 'is-incorrect');
    if (result.explanation) {
      const note = document.createElement('span');
      note.className = 'popup-hsk-explanation';
      note.innerHTML = result.explanation;
      feedback.appendChild(document.createTextNode(' '));
      feedback.appendChild(note);
    }
    const next = root.querySelector('[data-action="next"]');
    const last = this.session.index + 1 >= this.session.total();
    next.hidden = false;
    next.textContent = last ? 'See results' : 'Next';
  }
}

module.exports = HskTests;
