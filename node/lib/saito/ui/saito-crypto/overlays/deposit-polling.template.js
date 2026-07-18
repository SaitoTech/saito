module.exports = (ticker = '') => {
  return `<div id="saito-deposit-form" class="saito-crypto-deposit-container saito-overlay-size narrow">
            <div class="saito-overlay-form-header">
                <h2 class="saito-overlay-form-header-title">Depositing...</h2>
                <div class="saito-overlay-form-header-content">${ticker}</div>
            </div>
            <div class="saito-crypto-deposit-content">
              <div>This may take a few minutes to confirm, please be patient</div>
              <div class="game-loader-spinner"></div>
            </div>
            <div class="saito-progress-meter"><div class="file-transfer-progress" style="width:0%;"></div></div>
        </div>`;
};
