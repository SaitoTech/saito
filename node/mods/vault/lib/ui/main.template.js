module.exports = VaultMainTemplate = (app, mod) => {
  return `
  <div class="saito-vault">
    <section class="vault-cta-card saito-cta">
      <div class="saito-cta-logo vault-cta-logo" role="img" aria-label="Saito Vault"></div>
      <div class="saito-cta-subtitle vault-cta-tagline">Your NFT Is Your Access Key</div>
      <div class="saito-button-row">
        <button class="saito-button-primary" id="vault-secure-btn" type="button">
          Upload File
        </button>
        <button class="saito-button-secondary" id="vault-access-link" type="button">
          Access Uploaded Files
        </button>
      </div>
    </section>
  </div>
`;
};
