module.exports = (manager_self) => {
  const container = String(manager_self.container || '');
  const inOverlay = container.includes('chat-manager-overlay');
  const inChatPage = container.includes('chat-page-manager-content');

  const settingsBtn = `<div class="chat-manager-options"><i class="fa-solid fa-ellipsis"></i></div>`;
  const closeBtn = `<div class="alternate-close-button"><i class="fa-solid fa-xmark"></i></div>`;

  let actionsInner = settingsBtn;

  if (inOverlay) {
    const overlay =
      typeof document !== 'undefined' ? document.querySelector('.chat-manager-overlay') : null;
    const floating = overlay?.classList.contains('floating-cm-overlay');

    if (floating) {
      // Desktop floating overlay — X only (settings were hidden here)
      actionsInner = closeBtn;
    } else {
      // Mobile overlay navigation lives in the persistent bottom action bar.
      actionsInner = '';
    }
  } else if (inChatPage) {
    actionsInner = '';
  }

  const header = inChatPage
    ? ''
    : `<div id="chat-manager-header" class="saito-sidebar-header chat-manager-header">
      <div class="title chat-manager-title" title="Recent Chats and Secure Contacts">Chats</div>
      <div class="actions">${actionsInner}</div>
    </div>`;

  return `
  <div class="chat-manager">
    ${header}
    <div class="chat-manager-list hide-scrollbar saito-menu-select-heavy${
      manager_self.mod.browser_active ? '' : ' saito-sidebar-element'
    }">
    </div>
  </div>`;
};
