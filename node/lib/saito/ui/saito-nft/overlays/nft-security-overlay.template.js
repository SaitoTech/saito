module.exports = (publisher = '') => {
  const key = String(publisher || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const keyHtml = key
    ? `<p class="nft-security-overlay-key">${key}</p>`
    : '';

  return `
    <div class="nft-security-overlay saito-overlay-panel">
      <div class="nft-security-overlay-art">
        <img class="hero" src="/saito/img/security.png" alt="">
        <div class="nft-security-overlay-content">
          <div class="nft-security-overlay-copy">
            <h2 class="nft-security-overlay-title">Saito is an open network.</h2>
            <div class="nft-security-overlay-message">
              <p>This application is cryptographically signed by:</p>
              ${keyHtml}
              <p>Third-party applications can access your wallet. Only install applications you trust.</p>
            </div>
            <div class="nft-security-overlay-footer">
              <label class="nft-security-overlay-optout" for="nft-security-dont-show">
                <input id="nft-security-dont-show" class="saito-checkbox" type="checkbox" />
                <span>Don't show this again</span>
              </label>
              <div class="nft-security-overlay-actions">
                <button type="button" id="nft-security-ok" class="saito-button-secondary">Test in Other Browser...</button>
                <button type="button" id="nft-security-sure" class="saito-button-primary">Install into Wallet</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};
