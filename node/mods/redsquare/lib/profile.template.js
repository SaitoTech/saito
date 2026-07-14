module.exports = (profile) => {
  let p = profile.profile || {};
  const publicKey = p.publicKey || profile.mod?.publicKey || '';
  const name = p.name || 'Anonymous';
  const avatar = p.avatar || '/saito/img/dreamscape.png';
  const banner = p.banner || '';
  const bio = p.bio != null ? String(p.bio) : '';
  const canEdit = Boolean(p.can_edit);

  const keyHtml = publicKey
    ? `
      <div class="profile-key-row">
        <span class="profile-public-key" title="${publicKey}">${publicKey}</span>
        <button
          class="profile-copy-key"
          type="button"
          data-profile-key="${publicKey}"
          aria-label="Copy address"
          title="Copy address"
        >
          <i class="fas fa-copy" aria-hidden="true"></i>
        </button>
      </div>
    `
    : '';

  const bannerEditHtml = canEdit
    ? `<i id="saito-banner-edit" class="saito-banner-edit fas fa-camera" role="button" tabindex="0" aria-label="Edit banner"></i>`
    : '';

  const bioClass = [
    'profile-bio',
    'saito-profile-description',
    canEdit ? 'can-edit' : '',
    !bio && canEdit ? 'empty' : '',
    !bio && !canEdit ? 'profile-bio-empty' : ''
  ]
    .filter(Boolean)
    .join(' ');

  let bioInner = '';
  if (bio) {
    bioInner = `
      <div id="profile-description-${publicKey}" class="profile-description-${publicKey}" data-id="${publicKey}">${bio}</div>
      ${canEdit ? `<div class="saito-description-edit"><i class="fas fa-pen"></i></div>` : ''}
    `;
  } else if (canEdit) {
    bioInner = profile.emptyBioPlaceholderHtml
      ? profile.emptyBioPlaceholderHtml()
      : `<div class="saito-description-edit profile-bio-placeholder"></div>`;
  }

  const bannerStyle = banner ? ` style="background-image: url('${banner}')"` : '';

  // Injected into `.sidebar-right > .profile` — no outer `.profile` wrapper.
  // Posts / Replies / Likes are navigation destinations, not tabs.
  // Compose lives in the feed header (`.manager-header-actions`), not here.
  return `
      <div class="profile-card" data-profile-key="${publicKey}">
        <div id="profile-banner-${publicKey}" class="profile-banner saito-profile-banner profile-banner-${publicKey}" data-id="${publicKey}"${bannerStyle}>
          ${bannerEditHtml}
        </div>
        <div class="profile-body">
          <div class="profile-identity">
            <img class="profile-avatar" src="${avatar}" alt="${name}" />
            <div class="profile-identity-text">
              <span class="profile-name">${name}</span>
              ${keyHtml}
            </div>
          </div>
          <div class="${bioClass}">${bioInner}</div>
          <nav class="profile-nav" aria-label="Profile navigation">
            <div class="profile-nav-item" role="link" tabindex="0" data-profile-nav="posts">Posts</div>
            <div class="profile-nav-item" role="link" tabindex="0" data-profile-nav="replies">Replies</div>
            <div class="profile-nav-item" role="link" tabindex="0" data-profile-nav="likes">Likes</div>
          </nav>
        </div>
      </div>
  `;
};
