const SaitoHeader = require('../../../../lib/saito/ui/saito-header/saito-header');
const PopupHeaderTemplate = require('./popup-header.template');

class PopupHeader extends SaitoHeader {
  constructor(app, mod) {
    super(app, mod);
    this.name = 'PopupHeader UIComponent';
    this.slug = 'PopupHeader';
    this.header_class = 'popup-header';
  }

  async render() {
    await super.render();
    this.installNavigation();
  }

  installNavigation() {
    const header = document.getElementById('saito-header');
    if (!header) {
      return;
    }
    header.classList.add('popup-header');
    header.querySelector('.popup-header-nav')?.remove();
    header.querySelector('.popup-header-pages')?.remove();

    const logo = header.querySelector('.saito-header-logo-wrapper');
    if (!logo) {
      return;
    }
    logo.insertAdjacentHTML('afterend', PopupHeaderTemplate());

    const pages = header.querySelector('.popup-header-pages');
    const nav = header.querySelector('.popup-header-nav');
    pages.onclick = (event) => {
      event.stopPropagation();
      const open = nav.classList.toggle('is-open');
      pages.setAttribute('aria-expanded', String(open));
    };

    nav.querySelectorAll('[data-popup-nav]').forEach((link) => {
      link.onclick = (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        nav.classList.remove('is-open');
        pages.setAttribute('aria-expanded', 'false');
        const destination = link.dataset.popupNav;
        if (destination === 'home') {
          window.history.pushState({}, document.title, '/popup');
          this.app.connection.emit('popup-home-render-request');
        }
        if (destination === 'lessons') {
          window.history.pushState({}, document.title, '/popup/lessons');
          this.app.connection.emit('popup-lessons-render-request', 'all');
        }
        if (destination === 'vocabulary') {
          window.history.pushState({}, document.title, '/popup/review');
          this.app.connection.emit('popup-vocab-render-request');
        }
        if (destination === 'testimonials') {
          window.history.pushState({}, document.title, '/popup/testimonials');
          this.app.connection.emit('popup-testimonials-render-request');
        }
        this.syncNavigation();
      };
    });

    this.syncNavigation();
  }

  syncNavigation() {
    const path = window.location.pathname;
    let active = 'home';
    if (path.indexOf('/lessons') !== -1) {
      active = 'lessons';
    } else if (path.indexOf('/review') !== -1 || path.indexOf('/vocab') !== -1) {
      active = 'vocabulary';
    } else if (path.indexOf('/testimonials') !== -1) {
      active = 'testimonials';
    }
    document.querySelectorAll('#saito-header [data-popup-nav]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.popupNav === active);
    });
  }
}

module.exports = PopupHeader;
