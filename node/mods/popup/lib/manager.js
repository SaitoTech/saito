const LessonListTemplate = require('./manager-main.template');
const LessonMenuTemplate = require('./manager-right.template');
const TeaserTemplate = require('./teaser.template');
const SaitoLoader = require('./../../../lib/saito/ui/saito-loader/saito-loader');

class LessonManager {
  constructor(app, mod, container = '.saito-main') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.waiting_to_display = false;
    this.level = '';

    this.loader = new SaitoLoader(app, mod, '#popup-intersection');

    //////////////////////////////
    // load more on scroll-down //
    //////////////////////////////
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.showLoader();
          }
        });
      },
      {
        root: null,
        rootMargin: '30px',
        threshold: 1
      }
    );
  }

  render(level = 'all') {
    this.level = level;

    //
    // stop observering while we rebuild the page
    //
    this.intersectionObserver.disconnect();

    //
    // insert list of lessons into .saito-main
    //
    document.querySelector('.saito-main').innerHTML = '';
    document.querySelector('.saito-sidebar.right').innerHTML = '';
    this.app.browser.addElementToSelector(LessonListTemplate(), '.saito-main');
    this.app.browser.addElementToSelector(LessonMenuTemplate(), '.saito-sidebar.right');

    this.showLoader();

    const lessons = this.mod.catalog.getByCategory(level);
    if (this.mod.catalog.getAll().length == 0) {
      this.waiting_to_display = true;
    } else {
      this.waiting_to_display = false;
    }

    for (let i = 0; i < lessons.length; i++) {
      this.app.browser.addElementToSelector(TeaserTemplate(lessons[i]), '.lessons');
    }

    if (!this.waiting_to_display && lessons.length === 0 && level === 'quiz-night') {
      this.app.browser.addElementToSelector(
        '<div class="popup-empty-category">Quiz Night has no lessons.</div>',
        '.lessons'
      );
    }

    setTimeout(() => {
      this.hideLoader();
    }, 50);

    //
    // enable intersection observer
    //
    this.attachEvents();
  }

  attachEvents() {
    const levels = [
      'absolute-beginners',
      'elementary',
      'intermediate',
      'advanced',
      'film-friday',
      'short-stories',
      'ktv-wednesday',
      'hsk-beginner',
      'hsk-intermediate',
      'hsk-advanced',
      'new-hsk-level-1',
      'new-hsk-level-2',
      'new-hsk-level-3',
      'new-hsk-level-4',
      'new-hsk-level-5',
      'new-hsk-level-6'
    ];

    levels.forEach((level) => {
      const menu = document.querySelector('.' + level);
      if (!menu) {
        return;
      }
      menu.onclick = () => {
        window.history.pushState({}, document.title, '/popup/lessons/' + level);
        this.app.connection.emit('popup-lessons-render-request', level);
      };
    });

    document.querySelectorAll('.teaser').forEach((el) => {
      el.onclick = (e) => {
        let lesson_id = e.currentTarget.id;
        let lesson = this.mod.catalog.getById(lesson_id);
        if (lesson && lesson.userslug && lesson.slug) {
          window.history.pushState(
            {},
            document.title,
            `/popup/lessons/${encodeURIComponent(lesson.userslug)}/${encodeURIComponent(lesson.slug)}`
          );
        }
        this.app.connection.emit('popup-lesson-render-request', lesson_id);
      };
    });

    let ob = document.getElementById('popup-intersection');
    if (ob) {
      this.intersectionObserver.observe(ob);
    }
  }

  showLoader() {
    this.loader.show();
  }

  hideLoader() {
    this.loader.hide();
  }
}

module.exports = LessonManager;
