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
    this.has_chat = this.app.modules.returnModulesRespondingTo('chat-manager').length > 0;

    this.app.browser.replaceElementContentBySelector(MenuTemplate(this), this.container);
    this.attachEvents();
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

  openChat() {
    const chatMod = this.app.modules.returnModulesRespondingTo('chat-manager')[0];

    if (!chatMod) {
      return;
    }

    if (!chatMod.chat_manager_overlay) {
      const ChatManagerOverlay = require('../../chat/lib/overlays/chat-manager');
      chatMod.chat_manager_overlay = new ChatManagerOverlay(this.app, chatMod);
    }

    chatMod.chat_manager_overlay.render();
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
        this.mod.manager?.renderTimeline();
        this.setActiveMenuItem(homeItem);
      });
    }

    if (notificationsItem) {
      notificationsItem.addEventListener('click', () => {
        this.mod.manager?.renderNotifications();
        this.setActiveMenuItem(notificationsItem);
      });
    }

    if (chatItem) {
      chatItem.addEventListener('click', () => {
        // Overlay action — same pattern as Settings; chat UI stays in Chat module.
        this.openChat();
      });
    }

    if (settingsItem) {
      settingsItem.addEventListener('click', () => {
        // Settings is an overlay, not a destination — keep the current view's nav state.
        this.mod.settings_overlay?.open();
      });
    }
  }

  setActiveMenuItem(activeItem) {
    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    root.querySelectorAll('.item').forEach((item) => {
      item.classList.toggle('active', item === activeItem);
    });
  }
}

module.exports = Menu;
