module.exports = (menu) => {
  let badge = '';

  if (menu.notification_count > 0) {
    badge = `<span class="saito-notification-dot badge" aria-hidden="true">${menu.notification_count}</span>`;
  }

  const chatItem = menu.has_chat
    ? `
        <li class="item" data-nav="chat">
          <span class="icon">
            <i class="fa-solid fa-comments"></i>
          </span>
          <span class="label">Chat</span>
        </li>
      `
    : '';

  // Chat owns its UI; RedSquare only provides its desktop and mobile containers.
  return `
    <nav class="menu">
      <ul class="list saito-menu-select-subtle">
        <li class="item active" data-nav="home">
          <span class="icon">
            <i class="fa-solid fa-house"></i>
          </span>
          <span class="label">Home</span>
        </li>
        <li class="item" data-nav="notifications">
          <span class="icon">
            <i class="fa-solid fa-bell"></i>
            ${badge}
          </span>
          <span class="label">Notifications</span>
        </li>
        ${chatItem}
        <li class="item" data-nav="settings">
          <span class="icon">
            <i class="fa-solid fa-gear"></i>
          </span>
          <span class="label">Settings</span>
        </li>
      </ul>
    </nav>
  `;
};
