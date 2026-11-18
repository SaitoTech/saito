const LessonListTemplate = require('./manager-main.template');
const LessonMenuTemplate = require('./manager-right.template');
const TeaserTemplate = require('./teaser.template');
const SaitoLoader = require('./../../../lib/saito/ui/saito-loader/saito-loader');
const PremiumDownloads = require('./ui/premium-downloads');
const { isHskCategory } = require('./hsk-archive');

class LessonManager {
  constructor(app, mod, container = '.saito-main') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.waiting_to_display = false;
    this.level = '';

    this.loader = new SaitoLoader(app, mod, '#popup-intersection');
    this.premium = new PremiumDownloads(app, mod);

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
    if (this.mod.hsk) {
      this.mod.hsk.waiting = false;
      this.mod.hsk.active = false;
    }

    //
    // stop observering while we rebuild the page
    //
    this.intersectionObserver.disconnect();

    //
    // insert list of lessons into .saito-main
    //
    document.querySelector('.saito-main').innerHTML = '';
    this.showMenu(level);
    this.app.browser.addElementToSelector(LessonListTemplate(), '.saito-main');

    this.showLoader();

    let lessons = this.mod.catalog.getByCategory(level);
    if (level === 'all' || level === '' || level == null) {
      lessons = lessons.filter((lesson) => !isHskCategory(lesson.userslug));
    }
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
    this.restoreListPosition();
  }

  showMenu(active = this.level) {
    this.level = active;
    const left = document.querySelector('.saito-sidebar.left');
    const right = document.querySelector('.saito-sidebar.right');
    if (left) {
      left.innerHTML = '';
    }
    if (right) {
      right.innerHTML = '';
    }
    this.app.browser.addElementToSelector(LessonMenuTemplate(), '.saito-sidebar.left');
    this.premium.render();
    this.attachMenuEvents();
  }

  attachMenuEvents() {
    const levels = [
      'absolute-beginners',
      'elementary',
      'intermediate',
      'advanced',
      'film-friday',
      'short-stories',
      'ktv-wednesday'
    ];

    levels.forEach((level) => {
      const menu = document.querySelector('.popup-lesson-nav .' + level);
      if (!menu) {
        return;
      }
      menu.classList.toggle('is-active', this.level === level);
      menu.onclick = () => {
        window.history.pushState({}, document.title, '/popup/lessons/' + level);
        this.app.connection.emit('popup-lessons-render-request', level);
      };
    });

    const hsk = document.querySelector('.popup-lesson-nav .hsk-test');
    if (hsk) {
      hsk.classList.toggle('is-active', this.level === 'hsk-test');
      hsk.onclick = () => {
        window.history.pushState({}, document.title, '/popup/hsk');
        this.app.connection.emit('popup-hsk-render-request');
      };
    }
  }

  attachEvents() {
    this.attachMenuEvents();

    document.querySelectorAll('.teaser').forEach((el) => {
      el.onclick = (e) => {
        const scroller = document.querySelector('.saito-container');
        window.history.replaceState(
          {
            ...(window.history.state || {}),
            popupScroll: scroller ? scroller.scrollTop : 0,
            popupCategory: this.level || 'all'
          },
          document.title,
          window.location.href
        );
        let lesson_id = e.currentTarget.id;
        let lesson = this.mod.catalog.getById(lesson_id);
        if (lesson && lesson.userslug && lesson.slug) {
          window.history.pushState(
            { popupCategory: this.level || 'all' },
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

  restoreListPosition() {
    const scroll = window.history.state && window.history.state.popupScroll;
    if (typeof scroll !== 'number') {
      return;
    }
    const apply = () => {
      const scroller = document.querySelector('.saito-container');
      if (scroller) {
        scroller.scrollTop = scroll;
      }
    };
    apply();
    requestAnimationFrame(apply);
  }

  showLoader() {
    this.loader.show();
  }

  hideLoader() {
    this.loader.hide();
  }
}

module.exports = LessonManager;
