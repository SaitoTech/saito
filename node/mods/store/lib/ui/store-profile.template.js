module.exports = (profile) => {
  let p = profile.profile || {};
  const browser = profile.app?.browser;
  const publicKey = p.publicKey || profile.mod?.publicKey || '';
  const name = p.name || 'Anonymous';
  const avatar = p.avatar || '/saito/img/dreamscape.png';
  const banner = p.banner || '';
  const bio = p.bio != null ? String(p.bio) : '';
  const canEdit = Boolean(p.can_edit);

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
    ? `<i class="store-profile-banner-edit fas fa-camera" role="button" tabindex="0" aria-label="Edit banner"></i>`
    : '';

  const descriptionClass = [
    'store-profile-description',
    canEdit ? 'can-edit' : '',
    !bio ? 'empty' : ''
  ]
    .filter(Boolean)
    .join(' ');

  let descriptionInner = '';
  if (bio) {
    descriptionInner = `
      <div class="profile-description-${keyClass}" data-id="${safeKey}">${bio}</div>
      ${canEdit ? `<div class="store-profile-description-edit"><i class="fas fa-pen"></i></div>` : ''}
    `;
  } else {
    descriptionInner = profile.emptyBioPlaceholderHtml
      ? profile.emptyBioPlaceholderHtml(canEdit)
      : `<div class="store-profile-description-placeholder">No profile description yet.</div>`;
  }

  const bannerStyle = bannerUrl
    ? ` style="background-image: url('${escapeAttr(bannerUrl).replace(/'/g, '%27')}')"`
    : '';

  // Card only — Store / Posts / Settings live in UserStoreSidebar below this mount.
  return `
      <div class="card" data-profile-key="${safeKey}">
        <div class="store-profile-banner banner-${keyClass}" data-id="${safeKey}"${bannerStyle}>
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
        </div>
      </div>
  `;
};
