module.exports = (app, mod, nft_overlay) => {
  let nft = nft_overlay.nft;
  const capabilities = nft_overlay.capabilities;

  let text = '';
  if (nft.text) {
    text = nft.text;
  }
  if (nft.css) {
    text = nft.css;
  }
  if (nft.js) {
    text = nft.js;
  }
  if (nft.json) {
    text = nft.json;
  }

  const esc = (value) => app.browser.escapeHTML(String(value ?? ''));
  const display = typeof nft?.returnMediaDisplay === 'function' ? nft.returnMediaDisplay() : {};
  const isApp = nft?.returnType?.() === 'saito-app' || !!nft?.saito;
  const fallback = isApp ? '/saito/img/application.png' : '/saito/img/dreamscape.png';
  const rawImageUrl = nft?.image || display.backgroundImage || fallback;
  const imageUrl = app.browser.isSafeMediaUrl(rawImageUrl) ? rawImageUrl : fallback;
  const textHtml = text ? `<div class="saito-nft-text">${esc(text)}</div>` : '';
  const capsHtml = capabilities ? capabilities.renderHtml() : '';
  const metaHtml = capabilities ? capabilities.footerMetaHtml(nft) : '';
  const actionsHtml = capsHtml
    ? `<div class="saito-nft-capability-chrome">
          <div class="saito-nft-capabilities" role="toolbar" aria-label="NFT actions">
            <div class="saito-nft-recess" aria-hidden="true">
              <svg class="saito-nft-recess-shoulder" viewBox="0 0 12 75" preserveAspectRatio="none" aria-hidden="true">
                <path class="saito-nft-recess-fill" d="M0,0C2.2,0 8,75 12,75L12,0Z"></path>
              </svg>
              <div class="saito-nft-recess-span"></div>
              <svg class="saito-nft-recess-shoulder is-right" viewBox="0 0 12 75" preserveAspectRatio="none" aria-hidden="true">
                <path class="saito-nft-recess-fill" d="M0,0C2.2,0 8,75 12,75L12,0Z"></path>
              </svg>
            </div>
            ${capsHtml}
          </div>
          <div class="saito-nft-capability-desc is-empty" aria-live="polite"></div>
        </div>`
    : '';

  return `
    <div class="saito-nft-panel saito-nft-panel-view active">
      <div class="saito-nft-panel-body saito-nft-panel-body-view">
        <div class="saito-nft-image" style="background-image:url('${esc(imageUrl)}')">
          ${textHtml}
          ${nft.expires_at != null && nft.expires_at !== '' ? `<div class="saito-nft-expires-clock">${nft.remainingExpiresLabel()}</div>` : ''}
        </div>
        <div class="saito-nft-boundary" aria-hidden="true"></div>
        ${actionsHtml}
      </div>
      <footer class="saito-nft-panel-footer saito-nft-panel-footer-view">
        <div class="saito-nft-footer-meta">${metaHtml}</div>
        <button type="button" class="saito-nft-footer-details" aria-label="Details">
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </footer>
    </div>
  `;
};
