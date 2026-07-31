const MobileMenuTemplate = require('./../chat-manager/mobile-menu.template');

module.exports = (app, mod) => {
  let mobile = app.browser.isMobileBrowser() || window.innerWidth < 600;

  return `<div id="chat-manager-overlay" class="chat-manager-overlay ${
    mobile ? ' static-mobile-overlay' : ' floating-cm-overlay'
  }" data-chat-overlay-view="chats">
    <div class="chat-manager-overlay-content"></div>
    <section class="chat-manager-overlay-settings" aria-label="Chat settings">
      <div class="chat-manager-overlay-view-title saito-sidebar-header">Settings</div>
      <div class="chat-manager-overlay-settings-content"></div>
    </section>
    ${MobileMenuTemplate()}
  </div>`;
};
