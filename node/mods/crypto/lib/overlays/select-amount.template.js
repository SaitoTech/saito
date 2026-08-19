module.exports = (app, mod, form) => {
  let fee = 0;
  let ticker = form.ticker;
  let icons = ticker
    ? app.wallet.returnCryptoModuleByTicker(ticker)?.returnLogos() || {
        img: `/${ticker.toLowerCase()}/img/logo.png`
      }
    : null;

  let opt_html = '';
  if (form.fixed) {
    fee = mod.includeFeeInMax(ticker);
  } else {
    for (let t in mod.balances) {
      if (!ticker) {
        ticker = t;
        form.ticker = t;
      }
      if (form.ticker == t) {
        mod.max_balance = parseFloat(mod.balances[t].balance);
        fee = mod.includeFeeInMax(t);
        icons = app.wallet.returnCryptoModuleByTicker(t)?.returnLogos() || {
          img: `/${t.toLowerCase()}/img/logo.png`
        };
      }
      opt_html += `<option value="${t}" ${form.ticker == t ? 'selected' : ''}>${t}</option>`;
    }
  }

  let logo = icons ? `<img src="${icons.img}" alt="">` : '';
  let currency_html = form.fixed
    ? `<div class="currency">${logo}<span>${ticker}</span></div>`
    : `<div class="currency">${logo}<select class="saito-form-select" id="stake-select-crypto">${opt_html}</select></div>`;

  let warning_msg = '(0 network fees)';
  if (fee) {
    warning_msg = `(fee: ${fee} ${form.ticker})`;
  }

  return `
    <form class="saito-overlay-form" id="stake-crypto-request-container">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Play for Crypto</h2>
      </header>

      <div class="game-stake">
        <label for="amount_to_stake_input">Game Stake</label>
        <div class="amount-row">
          <input autocomplete="off" id="amount_to_stake_input" class="saito-input" type="number" min="0" max="9999999999.99999999" step="0.00000001" value="${form.stake || '0'}">
          ${currency_html}
        </div>
        <div class="stake-input-error" id="stake-amount-error"></div>
      </div>

      <div class="auth">
        <input class="saito-checkbox" type="checkbox" name="crypto-stake-confirm-input" id="crypto-stake-confirm-input"${form.authorize === false ? '' : ' checked'}>
        <label for="crypto-stake-confirm-input">Yes, I prefer fast in-game settlement ${warning_msg}</label>
      </div>
      <div class="stake-input-error" id="stake-checkbox-error"></div>

      <div class="saito-button-row">
        <button type="button" class="saito-button-primary" id="enable_staking_yes">Confirm</button>
      </div>
    </form>
  `;
};
