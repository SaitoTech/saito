module.exports = (profile) => {
  let p = profile.profile || {};
  const browser = profile.app?.browser;
  const publicKey = p.publicKey || profile.mod?.publicKey || '';
  const name = p.name || 'Anonymous';
  const avatar = p.avatar || '/saito/img/dreamscape.png';
  const banner = p.banner || '';
  const bio = p.bio != null ? String(p.bio) : '';
  const canEdit = Boolean(p.can_edit);
  const extLinks = Array.isArray(profile.ext_links) ? profile.ext_links : [];

  const escapeAttr = (value) =>
    browser?.escapeHTML
      ? browser.escapeHTML(String(value ?? ''))
      : String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

  const escapeText = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const classSafe = (value) => String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '');

  const safeImgSrc = (url, fallback) => {
    const trimmed = String(url || '').trim();
    if (browser?.isSafeMediaUrl?.(trimmed)) {
      return trimmed;
    }
    // Identicons are locally generated SVG data URLs; img src does not execute SVG script.
    if (/^data:image\/svg\+xml[;,]/i.test(trimmed) && !/[\s<>]/.test(trimmed)) {
      return trimmed;
    }
    return fallback;
  };

  const safeBannerUrl = (url) => {
    const trimmed = String(url || '').trim();
    return browser?.isSafeMediaUrl?.(trimmed) ? trimmed : '';
  };

  const safeKey = escapeAttr(publicKey);
  const safeName = escapeText(name);
  const safeAvatar = escapeAttr(safeImgSrc(avatar, '/saito/img/dreamscape.png'));
  const keyClass = classSafe(publicKey);
  const bannerUrl = safeBannerUrl(banner);

  const keyHtml = publicKey
    ? `
      <div class="key-row">
        <span class="public-key" title="${safeKey}">${safeKey}</span>
        <button
          class="copy-key saito-icon-button"
          type="button"
          data-profile-key="${safeKey}"
          aria-label="Copy address"
          title="Copy address"
        >
          <i class="fas fa-copy" aria-hidden="true"></i>
        </button>
      </div>
    `
    : '';

  const bannerEditHtml = canEdit
    ? `<i class="redsquare-profile-banner-edit fas fa-camera" role="button" tabindex="0" aria-label="Edit banner"></i>`
    : '';

  const descriptionClass = [
    'redsquare-profile-description',
    canEdit ? 'can-edit' : '',
    !bio ? 'empty' : ''
  ]
    .filter(Boolean)
    .join(' ');

  let descriptionInner = '';
  if (bio) {
    descriptionInner = `
      <div class="profile-description-${keyClass}" data-id="${safeKey}">${bio}</div>
      ${canEdit ? `<div class="redsquare-profile-description-edit"><i class="fas fa-pen"></i></div>` : ''}
    `;
  } else if (canEdit) {
    descriptionInner = profile.emptyBioPlaceholderHtml
      ? profile.emptyBioPlaceholderHtml()
      : `<div class="redsquare-profile-description-edit placeholder"></div>`;
  }

  const bannerStyle = bannerUrl
    ? ` style="background-image: url('${escapeAttr(bannerUrl).replace(/'/g, '%27')}')"`
    : '';

  const extLinksHtml = extLinks
    .map((item) => {
      const text = escapeText(item?.text);
      const rawLink = item?.link;
      if (!text || !rawLink || !browser?.isSafeHref?.(rawLink)) {
        return '';
      }
      return `<a class="item" href="${escapeAttr(rawLink)}" data-profile-ext="1">${text}</a>`;
    })
    .join('');

  // Injected into `.sidebar-right > .redsquare-profile` — no outer wrapper here.
  // Posts / Replies / Likes are navigation destinations, not tabs.
  // Module links (Store, Stack, …) come from respondTo('redsquare-profile').
  // Compose lives in Create (`.redsquare-create`), not here.
  // Bio is sanitized in Profile.buildProfileData before interpolation.
  return `
      <div class="card" data-profile-key="${safeKey}">
        <div class="redsquare-profile-banner banner-${keyClass}" data-id="${safeKey}"${bannerStyle}>
          ${bannerEditHtml}
        </div>
        <div class="body">
          <div class="identity">
            <img class="avatar" src="${safeAvatar}" alt="${escapeAttr(name)}" />
            <div class="text">
              <span class="name">${safeName}</span>
              ${keyHtml}
            </div>
          </div>
          <div class="${descriptionClass}">${descriptionInner}</div>
          <nav class="nav" aria-label="Profile navigation">
            <div class="item" role="link" tabindex="0" data-profile-nav="posts">Posts</div>
            <div class="item" role="link" tabindex="0" data-profile-nav="replies">Replies</div>
            <div class="item" role="link" tabindex="0" data-profile-nav="likes">Likes</div>
            ${extLinksHtml}
          </nav>
        </div>
      </div>
  `;
};
