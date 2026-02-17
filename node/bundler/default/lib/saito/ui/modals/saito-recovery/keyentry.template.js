module.exports = () => {
  return `
      <form id="key-entry-template" class="saito-overlay-form">
        <div class="saito-overlay-form-header">
          <div class="saito-overlay-form-header-title">Private Key Recovery</div>
        </div>
        <div class="saito-overlay-form-text">Enter your private key to login to / restore your Saito account.</div>
        <input type="text" id="private-key-input" class="saito-overlay-form-input saito-overlay-form-email" placeholder="private key" value="" />
        <div class="saito-button-row">
          <div class="saito-anchor" id="input-seed-phrase"><span>Use seed phrase...</span></div>
          <button type="button" class="saito-button-primary saito-overlay-form-submit" id="private-key-submit">Enter</button>
        </div>
      </form>
  `;
};
