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
    this.has_chat = false;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.notification_count = this.mod.getUnreadNotificationCount?.() || 0;
    this.has_chat = this.mod.main?.hasChatCapability?.() || false;

    this.app.browser.replaceElementContentBySelector(MenuTemplate(this), this.container);
    this.attachEvents();

    // Template defaults Home to .active; clear when user-content is the active view.
    if (this.mod.manager?.isProfileMode?.()) {
      this.clearActiveMenuItem();
    }
  }

  updateBadge(count = 0) {
    this.notification_count = count;

    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    const icon = root.querySelector('[data-nav="notifications"] .icon');

    if (!icon) {
      return;
    }

    let badge = icon.querySelector('.badge');

    if (count > 0) {
      if (!badge) {
        this.app.browser.addElementToSelector(
          `<span class="saito-notification-dot badge" aria-hidden="true">${count}</span>`,
          `${this.container} [data-nav="notifications"] .icon`
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

    // The container survives menu renders; delegate to its current buttons.
    root.addEventListener('click', (event) => {
      const item = event.target.closest('.menu .item[data-nav]');
      if (!item || !root.contains(item)) {
        return;
      }

      switch (item.dataset.nav) {
        case 'home':
          this.mod.main?.showMobileView('feed');
          this.mod.manager?.renderHome();
          this.setActiveMenuItem(item);
          break;
        case 'notifications':
          this.mod.main?.showMobileView('feed');
          this.mod.manager?.renderNotifications();
          this.setActiveMenuItem(item);
          break;
        case 'chat':
          if (this.mod.main?.showMobileView('chat')) {
            this.setActiveMenuItem(item);
          }
          break;
        case 'settings':
          if (this.mod.main?.showMobileView('settings')) {
            this.setActiveMenuItem(item);
          } else {
            this.mod.settings_overlay?.open();
          }
          break;
      }
    });
  }

  setActiveMenuItem(activeItem) {
    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    // Scope to primary nav items only (avoid chat-list .item nodes in .sidebar-left).
    root.querySelectorAll('.menu .item[data-nav]').forEach((item) => {
      item.classList.toggle('active', Boolean(activeItem) && item === activeItem);
    });
  }

  /**
   * Clear primary-nav selection. Used for user-content views (posts/replies/likes),
   * which are not primary destinations like Home or Notifications.
   */
  clearActiveMenuItem() {
    this.setActiveMenuItem(null);
  }
}

module.exports = Menu;
