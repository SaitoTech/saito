const ChatMainTemplate = require('./main.template');
const ChatManagerMenu = require('./../overlays/chat-manager-menu');

class ChatMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
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

    this.attachEvents();
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
