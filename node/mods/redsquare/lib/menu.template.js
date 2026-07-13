module.exports = (menu) => {
  let badge = '';

  if (menu.notification_count > 0) {
    badge = `<span class="saito-notification-dot menu-badge" aria-hidden="true">${menu.notification_count}</span>`;
  }

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
            <i class="fa-solid fa-user"></i>
          </span>
          <span class="menu-label">Profile</span>
        </li>
        <li class="menu-item">
          <span class="menu-icon">
            <i class="fa-solid fa-gear"></i>
          </span>
          <span class="menu-label">Settings</span>
        </li>
      </ul>

      <button class="menu-post saito-button-primary small" type="button">Post</button>
    </nav>
  `;
};
