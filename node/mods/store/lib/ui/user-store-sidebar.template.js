module.exports = ({ showPosts = false, showSettings = false } = {}) => {
  const postsItem = showPosts
    ? `
        <div class="item" role="button" tabindex="0" data-nav="posts">
          <span class="icon" aria-hidden="true"><i class="fa-solid fa-comment"></i></span>
          <span class="label">Posts</span>
        </div>`
    : '';

  const settingsItem = showSettings
    ? `
        <div class="item" role="button" tabindex="0" data-nav="settings">
          <span class="icon" aria-hidden="true"><i class="fa-solid fa-gear"></i></span>
          <span class="label">Settings</span>
        </div>`
    : '';

  // Injected into SaitoProfile's generic footer slot (inside the card).
  return `
    <nav class="user-store-nav saito-menu-select-subtle" aria-label="User store">
      <div class="item active" role="button" tabindex="0" data-nav="store" aria-current="page">
        <span class="icon" aria-hidden="true"><i class="fa-solid fa-store"></i></span>
        <span class="label">Store</span>
      </div>
      ${postsItem}
      ${settingsItem}
    </nav>
  `;
};
