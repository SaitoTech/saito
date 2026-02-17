module.exports = (app, mod, form) => {
  let html = `

    <div class="game-crypto-transfer-manager-container saito-overlay-size narrow" id="stake-crypto-request-container">

      <h2 class="auth_title">Amount to Stake?</h2>
      
      <div class="stake-input-container">
        <input autocomplete="off" id="amount_to_stake_input" class="stake" 
        type="number" min="0" max="9999999999.99999999" step="0.00000001" value="${form?.stake || '0'}" >`;

  let fee = 0;

  if (form.fixed) {
    html += `<div class="crypto-ticker">${form.ticker}</div>`;

    fee = mod.includeFeeInMax(form.ticker);
  } else {
    let img_html = `<div id="withdraw-logo-cont" class="withdraw-logo-cont">`;
    let opt_html = '';

    for (let ticker in mod.balances) {
      // Legacy fallback
      if (!form?.ticker) {
        console.log('Set initial ticker');
        form.ticker = ticker;
      }

      if (form.ticker == ticker) {
        mod.max_balance = parseFloat(mod.balances[ticker].balance);
        fee = mod.includeFeeInMax(ticker);
      }

      opt_html += `<option value="${ticker}" ${form.ticker == ticker ? 'selected' : ''}>${ticker}</option>`;

      let icons = app.modules.getRespondTos('crypto-logo', { ticker }).shift() || {
        img: `/${ticker.toLowerCase()}/img/logo.png`
      };

      img_html += `<img class="crypto-logo hide-element" data-ticker="${ticker}" src="${icons.img}">`;
      if (icons.sub_logo) {
        img_html += `<img class="chain-logo hide-element" data-ticker="${ticker}" src="${icons.sub_logo}">`;
      }
    }

    html += `<div class="token-dropdown">
                ${img_html}</div>
                <select class="withdraw-select-crypto" id="stake-select-crypto">${opt_html}</select>
             </div>`;
  }

  let warning_msg = '(0 network fees)';
  if (fee) {
    warning_msg = `(fee: ${fee} ${form?.ticker})`;
  }

  html += `<div class="crypto_msg">
              <div></div>
              <div class="select_max">Max: ${mod.max_balance}</div>
            </div>
            <div class="stake-input-error" id="stake-amount-error"></div>
          </div>`;

  /* Poorly named variable, but just tells us if is an opengame or not*/
  if (mod.max_match >= 0) {
    html += `
        <div class="crypto-stake-confirm-container">
          <input type="checkbox" name="crypto-stake-odds" id="crypto-stake-odds">
          <label for="crypto-stake-odds" class="commentary">set lower stake for opponent</label>
        </div>

        <div id="opponent-minimum-stake" class="stake-input-container hidden">
          <input autocomplete="off" id="minimum_accepted_stake" class="stake" 
          type="number" min="0" max="${mod.max_balance}" step="0.00000001" value="0" >
          <div class="crypto-ticker">${form.ticker}</div>
          <div class="stake-input-error" id="stake-opponent-error"></div>
        </div>`;
  }

  html += `

      <div class="crypto-stake-confirm-container">
        <input type="checkbox" checked name="crypto-stake-confirm-input" id="crypto-stake-confirm-input">
        <label for="crypto-stake-confirm-input" class="commentary">authorize in-game transfer ${warning_msg}</label>
        <div class="stake-input-error" id="stake-checkbox-error"></div>
      </div>

      <div class="button saito-button-primary crypto_amount_btn" id="enable_staking_yes">confirm</div>

    </div>
 
  `;

  return html;
};
