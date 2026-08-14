module.exports = () => {
  return `
      <form id="key-entry-template" class="saito-recovery">
        <div class="saito-overlay-form-header">
          <h2 class="saito-overlay-form-header-title">Import Private Key</h2>
        </div>
        <div class="saito-overlay-form-text">Enter your private key to login to / restore your Saito account.</div>
        <input type="text" id="private-key-input" class="saito-input saito-overlay-form-email" placeholder="private key" value="" autocomplete="off" autofocus />
        <div class="saito-button-row">
          <div class="saito-anchor" id="input-seed-phrase"><span>use seed phrase...</span></div>
          <button type="submit" class="saito-button-primary saito-overlay-form-submit" id="private-key-submit">Enter</button>
        </div>
      </form>
  `;
};
