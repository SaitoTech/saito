module.exports = (app, mod, details) => {
  let html = `  
  <div class="game-crypto-transfer-manager-container" id="receive-crypto-request-container">
    
    <h2 class="auth_title" id="auth_title">Receiving Payment</h2>

    <img class="spinner" id="spinner" src="/saito/img/spinner.svg" />

    <i id="game-crypto-icon" class="game-crypto-icon fa-solid fa-circle-check"></i>
    <i id="game-crypto-failure-icon" class="game-crypto-icon fa-solid fa-circle-exclamation"></i>

    <div class="amount">${details.amount} ${details.ticker}</div>

    <div class="counterparty-details"></div>
    `;

  if (!details?.trusted) {
    html += `<div class="button saito-button-primary crypto_transfer_btn" id="crypto_receipt_btn">continue</div>`;
    if (mod?.game?.over == 0) {
      html += `<div class="ignore">
              <input type="checkbox" checked id="ignore_checkbox" class="ignore_checkbox"> 
              don't wait for confirmation
            </div>`;
    }
  } else {
    html += `<div class="crypto-transfer-countdown">Closing in <span>3</span>s</div>`;
  }

  html += '</div>';
  return html;
};
