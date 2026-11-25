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
        let html = '<h2 class="lesson-section header">Transcript</h2><div class="popup-transcript">';
        for (let i = 0; i < this.mod.lesson.sentences.length; i++) {
          html += SentenceTemplate(this.mod.lesson, this.mod.lesson.sentences[i], this.mod);
        }
        html += '</div>';
        this.app.browser.addElementToSelector(html, '.lesson-section.transcript');
      }
    });

    this.mod.loadLessonWords(this.mod.lesson, async () => {
      if (this.mod.lesson.words && this.mod.lesson.words.length > 0) {
        const saved = await this.saved_vocabulary();
        let html = '<h2 class="lesson-section header">Vocabulary</h2><ul class="popup-vocab-list">';
        for (let i = 0; i < this.mod.lesson.words.length; i++) {
          const word = this.mod.lesson.words[i];
          html += WordTemplate(this.mod.lesson, word, this.mod, this.word_is_saved(word, saved));
        }
        html += '</ul>';
        this.app.browser.addElementToSelector(html, '.lesson-section.vocabulary');
      }
    });

    this.mod.loadLessonQuestions(this.mod.lesson, () => {
      if (this.mod.lesson.questions && this.mod.lesson.questions.length > 0) {
        let html = '<h2 class="lesson-section header">Comprehension</h2><div class="popup-questions">';
        for (let i = 0; i < this.mod.lesson.questions.length; i++) {
          html += QuestionTemplate(this.mod.lesson, this.mod.lesson.questions[i]);
        }
        html += '</div>';
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
          explanation.hidden = false;
          explanation.style.display = 'block';
        }
        event.preventDefault();
      });
    });
  }

  attachEvents() {
    const root = document.querySelector('.lesson-container');
    if (!root || root.dataset.bound) {
      return;
    }
    root.dataset.bound = '1';
    root.addEventListener('click', (event) => {
      const back = event.target.closest('.popup-lesson-back');
      if (back) {
        if (window.history.state && window.history.state.popupCategory && window.history.length > 1) {
          window.history.back();
          return;
        }
        const category = root.dataset.returnCategory || 'all';
        const path = category === 'all' ? '/popup/lessons' : '/popup/lessons/' + category;
        window.history.pushState({}, document.title, path);
        this.app.connection.emit('popup-lessons-render-request', category);
        return;
      }
      const spoken = event.target.closest('.popup-vocab-chinese');
      if (spoken) {
        event.preventDefault();
        event.stopPropagation();
        const src = spoken.dataset.audio;
        if (src && typeof playWordAudio === 'function') {
          try {
            playWordAudio(src, spoken);
          } catch (err) {}
        }
        return;
      }
      const card = event.target.closest('.popup-vocab-entry');
      if (!card || card.classList.contains('is-saved') || card.dataset.saving === '1') {
        return;
      }
      if (typeof add_to_vocab !== 'function') {
        return;
      }
      card.dataset.saving = '1';
      Promise.resolve(
        add_to_vocab(
          card.dataset.field1 || '',
          card.dataset.field2 || '',
          card.dataset.field3 || '',
          card.dataset.field4 || '',
          card.dataset.field5 || '',
          '',
          ''
        )
      )
        .then(() => {
          this.mark_saved(card);
        })
        .catch((err) => {
          card.dataset.saving = '';
          if (err && err.message === 'That pinyin or English translation is already saved') {
            this.mark_saved(card);
          }
        });
    });
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      const card = event.target.closest('.popup-vocab-entry');
      if (!card || event.target.closest('.popup-vocab-chinese')) {
        return;
      }
      event.preventDefault();
      card.click();
    });
  }

  mark_saved(card) {
    card.dataset.saving = '';
    card.classList.add('is-saved');
    card.setAttribute('aria-pressed', 'true');
  }

  async saved_vocabulary() {
    const keys = { pinyin: new Set(), english: new Set() };
    if (typeof this.mod.returnAllVocabulary !== 'function') {
      return keys;
    }
    try {
      const records = await this.mod.returnAllVocabulary();
      for (let i = 0; i < records.length; i++) {
        const pinyin = String(records[i].field3 || '').trim();
        const english = String(records[i].field4 || '').trim();
        if (pinyin) {
          keys.pinyin.add(pinyin);
        }
        if (english) {
          keys.english.add(english);
        }
      }
    } catch (err) {}
    return keys;
  }

  word_is_saved(word, saved) {
    const pinyin = String(word.field3 || '').trim();
    const english = String(word.field4 || '').trim();
    return (pinyin && saved.pinyin.has(pinyin)) || (english && saved.english.has(english));
  }
}

module.exports = PopupLesson;
