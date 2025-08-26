module.exports = () => {
  return `
      <form id="key-entry-template" class="saito-overlay-form">
        <div class="saito-overlay-form-header">
          <div class="saito-overlay-form-header-title">Seed Phrase Recovery</div>
        </div>
        <div class="saito-overlay-form-text">Enter your seed phrase to login to / restore your Saito account.</div>
        <textarea id="seed-phrase-input" class="saito-overlay-form-input saito-overlay-form-email" placeholder="seed phrase" rows="4" value=""></textarea>
        <div class="saito-button-row">
          <div class="saito-anchor" id="input-private-key"><span>Use private key...</span></div>
          <button type="button" class="saito-button-primary saito-overlay-form-submit" id="seed-phrase-submit">Enter</button>
        </div>
      </form>
  `;
};
