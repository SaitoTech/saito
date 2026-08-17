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

  const imageUrl = nft?.image || '/saito/img/dreamscape.png';
  const textHtml = text ? `<div class="saito-nft-text">${text}</div>` : '';
  const capsHtml = capabilities ? capabilities.renderHtml() : '';
  const metaHtml = capabilities ? capabilities.footerMetaHtml(nft) : '';

  return `
    <div class="saito-nft-panel saito-nft-panel-view active">
      <div class="saito-nft-panel-body saito-nft-panel-body-view">
        <div class="saito-nft-image" style="background-image:url('${imageUrl}')">
          ${textHtml}
          ${nft.expires_at != null && nft.expires_at !== '' ? `<div class="saito-nft-expires-clock">${nft.remainingExpiresLabel()}</div>` : ''}
          <div class="saito-nft-capability-chrome">
            <div class="saito-nft-capabilities" role="toolbar" aria-label="NFT capabilities">
              ${capsHtml}
            </div>
            <div class="saito-nft-capability-desc is-empty" aria-live="polite"></div>
          </div>
        </div>
      </div>
      <footer class="saito-nft-panel-footer saito-nft-panel-footer-view">
        <div class="saito-nft-footer-meta">${metaHtml}</div>
      </footer>
    </div>
  `;
};
