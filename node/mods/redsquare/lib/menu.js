const MenuTemplate = require('./menu.template');

class Menu {
  constructor(app, mod, container = '', composer = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.composer = composer;

    this.user = {
      name: 'Your Name',
      handle: 'you',
      avatar: '/saito/img/dreamscape.png'
    };
    this.notification_count = 0;

    this.chats = [
      {
        name: 'Alice Chen',
        preview: 'The refactor is looking great on staging.',
        avatar: '/saito/img/dreamscape.png',
        online: true
      },
      {
        name: 'Richard P.',
        preview: 'Can you review the TweetManager changes?',
        avatar: '/saito/img/tiled-logo.svg',
        online: true
      },
      {
        name: 'Saito Network',
        preview: 'Welcome to RedSquare chat — coming soon.',
        avatar: '/saito/img/dreamscape.png',
        online: false
      }
    ];
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.notification_count = this.mod.getUnreadNotificationCount?.() || 0;

    this.app.browser.replaceElementContentBySelector(MenuTemplate(this), this.container);
    this.attachEvents();
  }

  updateBadge(count = 0) {
    this.notification_count = count;

    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    const icon = root.querySelector('.menu-item:nth-child(2) .menu-icon');

    if (!icon) {
      return;
    }

    let badge = icon.querySelector('.menu-badge');

    if (count > 0) {
      if (!badge) {
        this.app.browser.addElementToSelector(
          `<span class="saito-notification-dot menu-badge" aria-hidden="true">${count}</span>`,
          `${this.container} .menu-item:nth-child(2) .menu-icon`
        );
        return;
      }

      badge.textContent = String(count);
      return;
    }

    if (badge) {
      badge.remove();
    }
  }

  attachEvents() {
    const root = document.querySelector(this.container);

    if (!root || root.dataset.menuBound) {
      return;
    }

    root.dataset.menuBound = '1';

    const homeItem = root.querySelector('.menu-item:nth-child(1)');
    const notificationsItem = root.querySelector('.menu-item:nth-child(2)');

    if (homeItem) {
      homeItem.addEventListener('click', () => {
        this.mod.manager?.showTimeline();
        this.setActiveMenuItem(homeItem);
      });
    }

    if (notificationsItem) {
      notificationsItem.addEventListener('click', () => {
        this.mod.manager?.showNotifications();
        this.setActiveMenuItem(notificationsItem);
      });
    }
  }

  setActiveMenuItem(activeItem) {
    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    root.querySelectorAll('.menu-item').forEach((item) => {
      item.classList.toggle('active', item === activeItem);
    });
  }
}

module.exports = Menu;
