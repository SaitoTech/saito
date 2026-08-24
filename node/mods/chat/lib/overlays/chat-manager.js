const ChatManagerOverlayTemplate = require('./chat-manager.template');
const ChatManagerMenu = require('./chat-manager-menu');

//Floating Chat Manager for mobile

class ChatManagerOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.headerClickHandler = null;
    this.historyEntryActive = false;
    this.backFn = null;
    this.hasBackFn = false;
    this.isOpen = false;
    this.oldRenderManagerToScreen = 0;
    this.oldChatPopupContainer = '';
    this.chatManagerMenu = new ChatManagerMenu(
      app,
      mod,
      '.chat-manager-overlay-settings-content',
      false
    );

    app.connection.on('close-chat-manager-overlay', () => {
      const overlay = document.querySelector('.chat-manager-overlay');
      if (overlay) {
        overlay.style.visibility = 'hidden';
      }

      this.isOpen = false;
      this.historyEntryActive = false;
      this.detachHeaderClose();

      if (this.hasBackFn) {
        window.onpopstate = this.backFn;
        this.backFn = null;
        this.hasBackFn = false;
      }

      if (this.mod.chat_manager) {
        this.mod.chat_manager.container = this.old_container;
        this.mod.chat_manager.chat_popup_container = this.oldChatPopupContainer;
        this.mod.chat_manager.render_manager_to_screen = this.oldRenderManagerToScreen;
        if (this.oldRenderManagerToScreen) {
          this.app.connection.emit('chat-manager-render-request');
        }
      }
    });
  }

  async render() {
    if (!document.querySelector('.chat-manager-overlay')) {
      this.app.browser.addElementToDom(ChatManagerOverlayTemplate(this.app, this.mod));
    }

    const overlay = document.querySelector('.chat-manager-overlay');
    overlay.style.visibility = 'visible';
    overlay.dataset.chatOverlayView = 'chats';
    this.setActiveAction('chats');

    const header = document.getElementById('saito-header');
    const overlayTop = header ? header.getBoundingClientRect().bottom : 0;
    overlay.style.setProperty('--chat-manager-overlay-top', `${Math.max(0, overlayTop)}px`);

    if (this.mod.chat_manager == null) {
      this.mod.respondTo('chat-manager');
      this.mod.chat_manager.render_popups_to_screen = 0;
    }

    if (!this.isOpen) {
      this.old_container = this.mod.chat_manager.container;
      this.oldChatPopupContainer = this.mod.chat_manager.chat_popup_container;
      this.oldRenderManagerToScreen = this.mod.chat_manager.render_manager_to_screen;
    }
    this.isOpen = true;

    // Make sure we can render chat manager within the overlay
    this.mod.chat_manager.render_manager_to_screen = 1;
    this.mod.chat_manager.container = '.chat-manager-overlay-content';
    this.mod.chat_manager.chat_popup_container = '';

    this.app.connection.emit('chat-manager-render-request');

    this.attachEvents();
  }

  //
  // Note: mod = Arcade
  //
  attachEvents() {
    if (this.app.browser.isMobileBrowser() || window.innerWidth < 600) {
      if (!this.historyEntryActive) {
        window.history.pushState('chat-manager-overlay', '');
        this.historyEntryActive = true;
        this.backFn = window.onpopstate;
        this.hasBackFn = true;
        window.onpopstate = (e) => {
          this.historyEntryActive = false;
          this.app.connection.emit('close-chat-manager-overlay');
        };
      }

      document
        .querySelectorAll('.chat-manager-overlay .chat-manager-mobile-menu .item')
        .forEach((item) => {
          item.onclick = async (e) => {
            const action = e.currentTarget.dataset.chatAction;

            if (action === 'chats') {
              this.showChats();
            }
            if (action === 'add-contact') {
              await this.chatManagerMenu.addContact();
            }
            if (action === 'new-group') {
              await this.chatManagerMenu.createGroup();
            }
            if (action === 'mark-read') {
              this.chatManagerMenu.markAllRead();
            }
            if (action === 'settings') {
              await this.showSettings();
            }
          };
        });

      setTimeout(() => this.attachHeaderClose(), 0);
    } else {
      this.app.browser.makeDraggable('chat-manager-overlay', 'chat-manager-header');

      let cmo = document.getElementById('chat-manager-overlay');
      cmo.style.resize = 'vertical';
    }
  }

  attachHeaderClose() {
    const header = document.getElementById('saito-header');
    if (!header || this.headerClickHandler) {
      return;
    }

    this.headerClickHandler = () => {
      if (this.historyEntryActive) {
        window.history.back();
      } else {
        this.app.connection.emit('close-chat-manager-overlay');
      }
    };
    header.addEventListener('click', this.headerClickHandler);
  }

  detachHeaderClose() {
    const header = document.getElementById('saito-header');
    if (header && this.headerClickHandler) {
      header.removeEventListener('click', this.headerClickHandler);
    }
    this.headerClickHandler = null;
  }

  setActiveAction(action) {
    document
      .querySelectorAll('.chat-manager-overlay .chat-manager-mobile-menu .item')
      .forEach((item) => {
        item.classList.toggle('active', item.dataset.chatAction === action);
      });
  }

  showChats() {
    const overlay = document.querySelector('.chat-manager-overlay');
    if (!overlay) {
      return;
    }

    overlay.dataset.chatOverlayView = 'chats';
    this.setActiveAction('chats');
    this.mod.chat_manager.container = '.chat-manager-overlay-content';
    this.app.connection.emit('chat-manager-render-request');
  }

  async showSettings() {
    const overlay = document.querySelector('.chat-manager-overlay');
    if (!overlay) {
      return;
    }

    overlay.dataset.chatOverlayView = 'settings';
    this.setActiveAction('settings');
    await this.chatManagerMenu.render();
  }
}

module.exports = ChatManagerOverlay;
