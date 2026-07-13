module.exports = (profile) => {
  let p = profile.profile || {};
  const name = p.name || 'Profile';
  const handle = p.handle != null ? String(p.handle).trim() : '';
  const avatar = p.avatar || '/saito/img/dreamscape.png';
  const banner = p.banner || avatar;
  const bio = p.bio || '';

  // Username / identifier only — never a public key in this slot.
  const showHandle =
    handle !== '' &&
    handle.toLowerCase() !== 'anon' &&
    handle.length <= 32 &&
    !/^[0-9A-Fa-f]{16,}$/.test(handle);

  const handleHtml = showHandle
    ? `<span class="profile-handle">@${handle.replace(/^@/, '')}</span>`
    : '';

  // Injected into `.sidebar-right > .profile` — no outer `.profile` wrapper.
  // Posts / Replies / Likes are navigation destinations, not tabs.
  return `
      <div class="profile-card">
        <div class="profile-banner">
          <img class="profile-banner-image" src="${banner}" alt="" />
        </div>
        <div class="profile-body">
          <div class="profile-identity">
            <img class="profile-avatar" src="${avatar}" alt="${name}" />
            <div class="profile-identity-text">
              <span class="profile-name">${name}</span>
              ${handleHtml}
            </div>
          </div>
          <p class="profile-bio">${bio}</p>
          <nav class="profile-nav" aria-label="Profile navigation">
            <div class="profile-nav-item" role="link" tabindex="0" data-profile-nav="posts">Posts</div>
            <div class="profile-nav-item" role="link" tabindex="0" data-profile-nav="replies">Replies</div>
            <div class="profile-nav-item" role="link" tabindex="0" data-profile-nav="likes">Likes</div>
          </nav>
          <button class="profile-new-post saito-button-primary" type="button">New Post</button>
        </div>
      </div>
  `;
};
