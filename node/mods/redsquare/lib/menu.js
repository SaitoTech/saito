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

    const homeItem = root.querySelector('[data-nav="home"]');
    const notificationsItem = root.querySelector('[data-nav="notifications"]');
    const chatItem = root.querySelector('[data-nav="chat"]');
    const settingsItem = root.querySelector('[data-nav="settings"]');

    if (homeItem) {
      homeItem.addEventListener('click', () => {
        this.mod.main?.showMobileView('feed');
        this.mod.manager?.renderHome();
        this.setActiveMenuItem(homeItem);
      });
    }

    if (notificationsItem) {
      notificationsItem.addEventListener('click', () => {
        this.mod.main?.showMobileView('feed');
        this.mod.manager?.renderNotifications();
        this.setActiveMenuItem(notificationsItem);
      });
    }

    if (chatItem) {
      chatItem.addEventListener('click', () => {
        if (this.mod.main?.showMobileView('chat')) {
          this.setActiveMenuItem(chatItem);
        }
      });
    }

    if (settingsItem) {
      settingsItem.addEventListener('click', () => {
        if (this.mod.main?.showMobileView('settings')) {
          this.setActiveMenuItem(settingsItem);
          return;
        }

        // Desktop keeps the existing RedSquare settings overlay.
        this.mod.settings_overlay?.open();
      });
    }
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
