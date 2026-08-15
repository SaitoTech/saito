module.exports = (app, mod, sobj) => {
  let warning_msg = '(0 network fees)';
  let fee = mod.includeFeeInMax(sobj.ticker);
  if (fee) {
    warning_msg = `(${fee} ${sobj.ticker})`;
  }

  let icons = app.wallet.returnCryptoModuleByTicker(sobj.ticker)?.returnLogos();
  let logo = icons?.img ? `<img src="${icons.img}" alt="">` : '';

  return `
  <form class="saito-overlay-form" id="approve-crypto-request-container">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">Play for Crypto</h2>
    </header>

    <div class="stake">
      <h1>${sobj.stake}</h1>
      <div class="currency">${logo}<span>${sobj.ticker}</span></div>
    </div>

    <div class="auth">
      <input class="saito-checkbox" type="checkbox" checked name="crypto-stake-confirm-input" id="approve-crypto-stake-confirm-input">
      <label for="approve-crypto-stake-confirm-input">Yes, I prefer fast in-game settlement ${warning_msg}</label>
    </div>
    <p class="saito-overlay-form-text">Selecting this option allows the game to automatically handle payments and receipts using fast, internal transfers. You can change this in Settings at any time.</p>

    <div class="saito-button-row">
      <button type="button" class="saito-button-secondary" id="enable_staking_no">No, thanks</button>
      <button type="button" class="saito-button-primary" id="enable_staking_yes">Yes, I'm in</button>
    </div>
  </form>
  `;
};
