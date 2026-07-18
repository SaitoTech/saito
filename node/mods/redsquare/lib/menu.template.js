module.exports = (menu) => {
  let badge = '';

  if (menu.notification_count > 0) {
    badge = `<span class="saito-notification-dot badge" aria-hidden="true">${menu.notification_count}</span>`;
  }

  // Chat is owned by the Chat module (respondTo('chat-manager')) and mounts
  // into `.sidebar-left` beside this menu — do not duplicate chat UI here.
  return `
    <nav class="menu">
      <ul class="list saito-menu-select-subtle">
        <li class="item active">
          <span class="icon">
            <i class="fa-solid fa-house"></i>
          </span>
          <span class="label">Home</span>
        </li>
        <li class="item">
          <span class="icon">
            <i class="fa-solid fa-bell"></i>
            ${badge}
          </span>
          <span class="label">Notifications</span>
        </li>
        <li class="item">
          <span class="icon">
            <i class="fa-solid fa-gear"></i>
          </span>
          <span class="label">Settings</span>
        </li>
      </ul>
    </nav>
  `;
};
