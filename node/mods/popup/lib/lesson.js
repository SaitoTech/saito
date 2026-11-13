const PopupLessonMainTemplate = require('./lesson-main.template');
const PopupLessonRightTemplate = require('./lesson-right.template');
const WordTemplate = require('./word.template');
const QuestionTemplate = require('./question.template');
const SentenceTemplate = require('./sentence.template');
const SaitoLoader = require('./../../../lib/saito/ui/saito-loader/saito-loader');

class PopupLesson {
  constructor(app, mod, container = '.popup-lesson') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.name = 'PopupLesson';
    this.loader = new SaitoLoader(this.app, this.mod, '.popup-content');
  }

  render(lesson_id = '') {
    this.mod.lesson = this.mod.catalog.getById(lesson_id);

    if (!this.mod.lesson || this.mod.lesson.content == null) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.label = this.mod.lesson.title || '';
      window.lesson_id = this.mod.lesson.id || '';
    }

    if (!document.querySelector('.lesson-container')) {
      this.app.browser.addElementToSelector(
        PopupLessonMainTemplate(this.mod.lesson, this.mod),
        '.saito-main'
      );
      this.app.browser.addElementToSelector(
        PopupLessonRightTemplate(this.mod.lesson, this.mod),
        '.saito-sidebar.right'
      );
    } else {
      this.app.browser.replaceElementBySelector(
        PopupLessonMainTemplate(this.mod.lesson),
        '.lesson-container'
      );
    }

    this.mod.loadLessonSentences(this.mod.lesson, () => {
      if (this.mod.lesson.sentences && this.mod.lesson.sentences.length > 0) {
        let html = '<div class="lesson-section header">transcript</div>';
        html += '<table style="width:100%;max-width:1400px;">';
        for (let i = 0; i < this.mod.lesson.sentences.length; i++) {
          html += SentenceTemplate(this.mod.lesson, this.mod.lesson.sentences[i], this.mod);
        }
        html += '</table>';
        this.app.browser.addElementToSelector(html, '.lesson-section.transcript');
      }
    });

    this.mod.loadLessonWords(this.mod.lesson, () => {
      if (this.mod.lesson.words && this.mod.lesson.words.length > 0) {
        let html = '<div class="lesson-section header">vocabulary</div>';
        html += '<table style="width:100%;max-width:1400px;">';
        for (let i = 0; i < this.mod.lesson.words.length; i++) {
          html += WordTemplate(this.mod.lesson, this.mod.lesson.words[i], this.mod);
        }
        html += '</table>';
        this.app.browser.addElementToSelector(html, '.lesson-section.vocabulary');
      }
    });

    this.mod.loadLessonQuestions(this.mod.lesson, () => {
      if (this.mod.lesson.questions && this.mod.lesson.questions.length > 0) {
        let html = '<div class="lesson-section header">comprehension</div>';
        for (let i = 0; i < this.mod.lesson.questions.length; i++) {
          html += QuestionTemplate(this.mod.lesson, this.mod.lesson.questions[i]);
        }
        this.app.browser.addElementToSelector(html, '.lesson-section.questions');
        this.attachQuestionEvents();
      }
    });

    this.attachEvents();
  }

  attachQuestionEvents() {
    document.querySelectorAll('.lesson-question-choice').forEach((el) => {
      el.addEventListener('click', (event) => {
        const card = el.closest('.lesson_question');
        if (!card) {
          return;
        }
        const correct = String(card.dataset.correct);
        const choice = String(el.dataset.choice);
        const radio = el.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
        }
        card.querySelectorAll('.lesson-question-choice').forEach((choiceEl) => {
          choiceEl.classList.remove('option_correct', 'option_incorrect');
        });
        if (choice === correct) {
          el.classList.add('option_correct');
        } else {
          el.classList.add('option_incorrect');
          const right = card.querySelector(`[data-choice="${correct}"]`);
          if (right) {
            right.classList.add('option_correct');
          }
        }
        const explanation = card.querySelector('.lesson_question_explanation');
        if (explanation) {
          explanation.style.display = 'block';
        }
        event.preventDefault();
      });
    });
  }

  attachEvents() {}
}

module.exports = PopupLesson;
