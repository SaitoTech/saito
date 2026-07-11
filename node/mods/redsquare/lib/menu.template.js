module.exports = (menu) => {
  let badge = '';

  if (menu.notification_count > 0) {
    badge = `<span class="menu-badge">${menu.notification_count}</span>`;
  }

  return `
    <nav class="menu">
      <a class="menu-logo" href="/redsquare">
        <i class="fa-solid fa-square"></i>
        <span>RedSquare</span>
      </a>

      <ul class="menu-list">
        <li class="menu-item active">
          <i class="fa-solid fa-house"></i>
          <span>Home</span>
        </li>
        <li class="menu-item">
          <i class="fa-solid fa-magnifying-glass"></i>
          <span>Explore</span>
        </li>
        <li class="menu-item">
          <i class="fa-solid fa-bell"></i>
          <span>Notifications</span>
          ${badge}
        </li>
        <li class="menu-item">
          <i class="fa-solid fa-envelope"></i>
          <span>Messages</span>
        </li>
        <li class="menu-item">
          <i class="fa-solid fa-user"></i>
          <span>Profile</span>
        </li>
      </ul>

      <button class="menu-post" type="button">Post</button>

      <div class="menu-user">
        <img class="menu-user-avatar" src="${menu.user.avatar}" alt="${menu.user.name}" />
        <div class="menu-user-info">
          <span class="menu-user-name">${menu.user.name}</span>
          <span class="menu-user-handle">@${menu.user.handle}</span>
        </div>
        <i class="fa-solid fa-ellipsis menu-user-more"></i>
      </div>
    </nav>
  `;
};
