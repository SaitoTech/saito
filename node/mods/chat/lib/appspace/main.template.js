const MobileMenuTemplate = require('./../chat-manager/mobile-menu.template');

module.exports = () => {
  return `
    <div id="saito-container" class="saito-container chat-main-container">
      <div id="chat-main-sidebar-left" class="saito-sidebar left">
        <div class="chat-page-manager" data-chat-view="chats">
          <div class="chat-page-manager-content"></div>
          <section class="chat-page-manager-settings" aria-label="Chat settings">
            <div class="chat-page-manager-view-title saito-sidebar-header">Settings</div>
            <div class="chat-page-manager-settings-content"></div>
          </section>
          ${MobileMenuTemplate()}
        </div>
      </div>
      <div id="chat-main" class="saito-main"></div>
      <div class="saito-sidebar right"></div>
    </div>
  `;
};
