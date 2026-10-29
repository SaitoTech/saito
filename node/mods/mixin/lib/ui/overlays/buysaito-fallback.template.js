module.exports = (app, mod, self) => {
  return `
    <div class="purchase-container saito-overlay-panel saito-overlay-size" id="purchase-container">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Get SAITO</h2>
      </header>
      <div class="buysaito-options"></div>
      <div class="buysaito-stage" id="buysaito-stage">
        <div class="buysaito-fallback-info">
          <p>Native SAITO is required for this action.</p>
          <p>Automated purchase is currently unavailable.</p>
          <p>
            Learn how to obtain SAITO in the
            <a href="https://wiki.saito.io/tokenomics" target="_blank" rel="noopener noreferrer">Saito tokenomics guide</a>.
          </p>
        </div>
      </div>
      <div class="buysaito-footer-note">Already have (ERC-20 wrapped) SAITO? Visit our <a href="/migration">migration portal</a></div>
    </div>
  `;
};
