module.exports = (ticker = '') => {
  return `<div id="saito-deposit-form" class="saito-crypto-deposit-container saito-overlay-size narrow">
            <header class="saito-overlay-form-header">
                <h2 class="saito-overlay-form-header-title">Depositing...</h2>
                <div class="saito-overlay-form-header-content">${ticker}</div>
            </header>
            <section class="saito-crypto-deposit-content">
              <p>This may take a few minutes to confirm, please be patient</p>
              <div class="game-loader-spinner"></div>
            </section>
            <div class="saito-progress-meter"><div class="file-transfer-progress" style="width:0%;"></div></div>
        </div>`;
};
