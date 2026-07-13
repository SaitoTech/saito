module.exports = (menu) => {
  let badge = '';

  if (menu.notification_count > 0) {
    badge = `<span class="saito-notification-dot menu-badge" aria-hidden="true">${menu.notification_count}</span>`;
  }

  let chats = (menu.chats || [])
    .map(
      (chat) => `
        <li class="menu-chat-item${chat.online ? ' online' : ''}">
          <div class="menu-chat-identicon saito-identicon-box">
            <img class="menu-chat-avatar saito-identicon" src="${chat.avatar}" alt="${chat.name}" />
            <span class="online-status-indicator" aria-hidden="true"></span>
          </div>
          <div class="menu-chat-info">
            <span class="menu-chat-name saito-address">${chat.name}</span>
            <span class="menu-chat-preview saito-userline">${chat.preview}</span>
          </div>
        </li>
      `
    )
    .join('');

  return `
    <nav class="menu">
      <ul class="menu-list saito-menu-select-subtle">
        <li class="menu-item active">
          <span class="menu-icon">
            <i class="fa-solid fa-house"></i>
          </span>
          <span class="menu-label">Home</span>
        </li>
        <li class="menu-item">
          <span class="menu-icon">
            <i class="fa-solid fa-bell"></i>
            ${badge}
          </span>
          <span class="menu-label">Notifications</span>
        </li>
        <li class="menu-item">
          <span class="menu-icon">
            <i class="fa-solid fa-gear"></i>
          </span>
          <span class="menu-label">Settings</span>
        </li>
      </ul>

      <section class="menu-chat">
        <header class="menu-chat-header sidebar-header">
          <h3 class="menu-chat-title sidebar-title">Chats</h3>
          <button class="menu-chat-options" type="button" aria-label="Chat options">
            <i class="fa-solid fa-ellipsis"></i>
          </button>
        </header>
        <div class="menu-chat-panel saito-sidebar-element">
          <ul class="menu-chat-list">
            ${chats}
          </ul>
        </div>
      </section>
    </nav>
  `;
};
