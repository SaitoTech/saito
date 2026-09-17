module.exports = (ticker = '') => {
  return `<div id="saito-deposit-form" class="saito-overlay-form saito-overlay-panel retain-surface saito-crypto-deposit saito-overlay-size narrow">
            <div class="saito-overlay-form-header">
                <div class="saito-overlay-form-header-title">Depositing...</div>
                <div class="saito-overlay-form-header-content">${ticker}</div>
            </div>
            <section class="saito-crypto-deposit-content">
              <p>This may take a few minutes to confirm, please be patient</p>
              <div class="game-loader-spinner"></div>
            </section>
            <div class="saito-progress-meter"><div class="file-transfer-progress" style="width:0%;"></div></div>
        </div>`;
};
