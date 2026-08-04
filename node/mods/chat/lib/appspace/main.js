const ChatMainTemplate = require('./main.template');
const ChatManagerMenu = require('./../overlays/chat-manager-menu');

class ChatMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visualViewport = null;
    this.visualViewportHandler = null;
    this.chatManagerMenu = new ChatManagerMenu(
      app,
      mod,
      '.chat-page-manager-settings-content',
      false
    );
  }

  render() {
    if (document.querySelector('.saito-container')) {
      this.app.browser.replaceElementBySelector(ChatMainTemplate(), '.saito-container');
    } else {
      this.app.browser.addElementToDom(ChatMainTemplate());
    }

    this.attachVisualViewportHandler();
    this.attachEvents();
  }

  attachVisualViewportHandler() {
    const container = document.querySelector('.chat-main-container');
    if (!container || !window.visualViewport) {
      return;
    }

    this.removeVisualViewportHandler();
    this.visualViewport = window.visualViewport;
    this.visualViewportHandler = () => {
      const headerBottom = Math.max(
        0,
        document.querySelector('#saito-header')?.getBoundingClientRect().bottom || 0
      );
      const viewportTop = this.visualViewport.offsetTop;
      const containerTop = Math.max(viewportTop, headerBottom);
      const visibleHeaderHeight = Math.max(0, headerBottom - viewportTop);

      container.style.setProperty('--chat-page-viewport-top', `${containerTop}px`);
      container.style.setProperty(
        '--chat-page-viewport-height',
        `${Math.max(0, this.visualViewport.height - visibleHeaderHeight)}px`
      );
    };

    this.visualViewportHandler();
    this.visualViewport.addEventListener('resize', this.visualViewportHandler);
    this.visualViewport.addEventListener('scroll', this.visualViewportHandler);
  }

  removeVisualViewportHandler() {
    if (this.visualViewport && this.visualViewportHandler) {
      this.visualViewport.removeEventListener('resize', this.visualViewportHandler);
      this.visualViewport.removeEventListener('scroll', this.visualViewportHandler);
    }

    this.visualViewport = null;
    this.visualViewportHandler = null;
  }

  attachEvents() {
    let target_div = '#chat-main-sidebar-left';
    this.app.browser.makeResizeable(target_div, target_div, 'chat-main', 'horizontal');

    document
      .querySelectorAll('.chat-page-manager .chat-manager-mobile-menu .item')
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
  }

  setActiveAction(action) {
    document
      .querySelectorAll('.chat-page-manager .chat-manager-mobile-menu .item')
      .forEach((item) => {
        item.classList.toggle('active', item.dataset.chatAction === action);
      });
  }

  showChats() {
    const manager = document.querySelector('.chat-page-manager');
    if (!manager) {
      return;
    }

    manager.dataset.chatView = 'chats';
    this.setActiveAction('chats');
    this.mod.chat_manager.container = '.chat-page-manager-content';
    this.app.connection.emit('chat-manager-render-request');
  }

  async showSettings() {
    const manager = document.querySelector('.chat-page-manager');
    if (!manager) {
      return;
    }

    manager.dataset.chatView = 'settings';
    this.setActiveAction('settings');
    await this.chatManagerMenu.render();
  }
}

module.exports = ChatMain;
