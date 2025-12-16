module.exports = VaultMainTemplate = (app, mod) => {
  return `
  <div class="saito-vault">

    <div class="saito-vault-layout"> 

      <section class="vault-hero">

        <h1>Saito File Vault</h1>

        <h2>
          your NFT is the <span class="vault-rotating-word">access key</span>
        </h2>

        <div class="vault-cta">
          <button class="vault-btn primary" id="vault-secure-btn">
            Upload File
          </button>
        </div>
  
      </section>

      <div id="vault-access-link" class="vault-access-link">
        or <div class="vault-access-textlink">access</div> an existing file...
      </div>

    </div>

  </div>

`;
};

