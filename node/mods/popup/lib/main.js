const PopupMainTemplate = require('./main.template');
const HomeTemplate = require('./home.template');
const TestimonialsTemplate = require('./testimonials.template');

class PopupMain {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.name = 'PopupMain';

    this.app.connection.on('popup-home-render-request', () => {
      this.renderHome();
    });

    this.app.connection.on('popup-testimonials-render-request', () => {
      this.renderTestimonials();
    });

    this.app.connection.on('popup-lessons-render-request', (level = 'all') => {
      this.showApplicationView('catalog');
      document.querySelector('.saito-main').innerHTML = '';
      document.querySelector('.saito-sidebar.right').innerHTML = '';
      this.mod.manager.render(level);
      this.syncHeader();
    });

    try {
      this.app.connection.on('popup-lesson-render-request', (lesson_id) => {
        this.showApplicationView('tool');
        document.querySelector('.saito-main').innerHTML = '';
        document.querySelector('.saito-sidebar.right').innerHTML = '';
        this.mod.lessonui.render(lesson_id);
        this.syncHeader();
      });
    } catch (err) {}

    try {
      this.app.connection.on('popup-vocab-render-request', (review_id = 0, offset = 0) => {
        this.showApplicationView('tool');
        document.querySelector('.saito-main').innerHTML = '';
        document.querySelector('.saito-sidebar.right').innerHTML = '';
        this.mod.vocab.render(review_id, offset);
        this.syncHeader();
      });
    } catch (err) {}
  }

  render() {
    this.renderHome();
  }

  ensureShell() {
    if (!document.querySelector('.saito-container')) {
      this.app.browser.addElementToDom(PopupMainTemplate(this.mod));
      this.bindChatLauncher();
    }
  }

  bindChatLauncher() {
    const root = document.querySelector('.popup-chat');
    if (!root || root.dataset.bound) {
      return;
    }
    root.dataset.bound = '1';
    const launcher = root.querySelector('.popup-chat-launcher');
    const panel = root.querySelector('.popup-chat-panel');
    const badge = root.querySelector('.popup-chat-badge');
    const host = root.querySelector('.popup-chat-host');

    launcher.onclick = () => {
      const open = panel.hasAttribute('hidden');
      if (open) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
      root.classList.toggle('is-open', open);
      launcher.setAttribute('aria-expanded', String(open));
    };

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || panel.hasAttribute('hidden')) {
        return;
      }
      panel.setAttribute('hidden', '');
      root.classList.remove('is-open');
      launcher.setAttribute('aria-expanded', 'false');
    });

    const syncBadge = () => {
      let count = 0;
      host.querySelectorAll('.saito-notification-dot').forEach((dot) => {
        const value = parseInt(dot.textContent, 10);
        count += Number.isNaN(value) ? 1 : value;
      });
      if (count > 0) {
        badge.hidden = false;
        badge.textContent = count > 99 ? '99+' : String(count);
      } else {
        badge.hidden = true;
      }
    };

    new MutationObserver(syncBadge).observe(host, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  showEditorialView() {
    this.ensureShell();
    const container = document.querySelector('.saito-container');
    container.classList.add('popup-editorial-view');
    container.classList.remove('popup-catalog-view', 'popup-tool-view');
    document.body.classList.add('popup-editorial-body');
    document.querySelector('.saito-main').innerHTML = '';
    document.querySelector('.saito-sidebar.right').innerHTML = '';
    document.querySelector('.saito-sidebar.left').innerHTML = '';
  }

  showApplicationView(mode = 'catalog') {
    this.ensureShell();
    const container = document.querySelector('.saito-container');
    if (container) {
      container.classList.remove('popup-editorial-view');
      container.classList.toggle('popup-catalog-view', mode === 'catalog');
      container.classList.toggle('popup-tool-view', mode === 'tool');
    }
    document.body.classList.remove('popup-editorial-body');
  }

  renderHome() {
    this.showEditorialView();
    this.app.browser.addElementToSelector(HomeTemplate(this.mod), '.saito-main');
    this.attachEvents();
  }

  renderTestimonials() {
    this.showEditorialView();
    this.app.browser.addElementToSelector(TestimonialsTemplate(), '.saito-main');
    this.attachEvents();
  }

  follow(selector, path, emit, detail) {
    const el = document.querySelector(selector);
    if (!el) {
      return;
    }
    el.onclick = (e) => {
      if (e && e.preventDefault) {
        e.preventDefault();
      }
      window.history.pushState({}, document.title, path);
      this.app.connection.emit(emit, detail);
    };
  }

  attachEvents() {
    this.follow('.popup-home-cta', '/popup/lessons', 'popup-lessons-render-request', 'all');
    this.syncHeader();
  }

  syncHeader() {
    if (this.mod.header && this.mod.header.syncNavigation) {
      this.mod.header.syncNavigation();
    }
  }
}

module.exports = PopupMain;
