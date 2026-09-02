module.exports = ({ showPosts = false, showSettings = false } = {}) => {
  const postsItem = showPosts
    ? `
        <li class="item" role="button" tabindex="0" data-nav="posts">
          <span class="icon" aria-hidden="true"><i class="fa-solid fa-comment"></i></span>
          <span class="label">Posts</span>
        </li>`
    : '';

  const settingsItem = showSettings
    ? `
        <li class="item" role="button" tabindex="0" data-nav="settings">
          <span class="icon" aria-hidden="true"><i class="fa-solid fa-gear"></i></span>
          <span class="label">Settings</span>
        </li>`
    : '';

  return `
    <div class="user-store-rail">
      <div class="user-store-profile store-profile"></div>
      <ul class="list saito-menu-select-subtle" role="list">
        <li class="item active" role="button" tabindex="0" data-nav="store" aria-current="page">
          <span class="icon" aria-hidden="true"><i class="fa-solid fa-store"></i></span>
          <span class="label">Store</span>
        </li>
        ${postsItem}
        ${settingsItem}
      </ul>
    </div>
  `;
};
