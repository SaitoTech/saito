module.exports = (app, mod, form) => {
  let ticker = form.ticker;
  let icons = ticker
    ? app.wallet.returnCryptoModuleByTicker(ticker)?.returnLogos() || {
        img: `/${ticker.toLowerCase()}/img/logo.png`
      }
    : null;

  let opt_html = '';
  if (form.fixed) {
    // fixed ticker — no balance list needed for template
  } else {
    for (let t in mod.balances) {
      if (!ticker) {
        ticker = t;
        form.ticker = t;
      }
      if (form.ticker == t) {
        mod.max_balance = parseFloat(mod.balances[t].balance);
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

  const toggle_label = form.one_sided ? 'Use equal stakes' : 'Give Odds or Set a Prize';

  let stake_inputs_html = '';
  let stake_heading_html = '';
  if (form.one_sided) {
    stake_inputs_html = `
        <div class="amount-row one-sided-stake-row">
          <label class="game-stake-label" for="player1_stake_input">I Stake:</label>
          <label class="game-stake-label" for="player2_stake_input">They Stake:</label>
          <button type="button" class="stake-mode-toggle" id="stake-mode-toggle">${toggle_label}</button>
          <input autocomplete="off" id="player1_stake_input" class="saito-input player-stake-input" type="number" min="0" max="9999999999.99999999" step="0.00000001" value="${form.player1_stake ?? form.stake ?? '0'}" aria-label="My stake" placeholder="Player 1">
          <input autocomplete="off" id="player2_stake_input" class="saito-input player-stake-input" type="number" min="0" max="9999999999.99999999" step="0.00000001" value="${form.player2_stake ?? '0'}" aria-label="Their stake" placeholder="Player 2">
          ${currency_html}
        </div>`;
  } else {
    stake_heading_html = `
        <div class="game-stake-heading">
          <label class="game-stake-label" for="amount_to_stake_input">Everyone Stakes:</label>
          <button type="button" class="stake-mode-toggle" id="stake-mode-toggle">${toggle_label}</button>
        </div>`;
    stake_inputs_html = `
        <div class="amount-row equal-stake-row">
          <input autocomplete="off" id="amount_to_stake_input" class="saito-input" type="number" min="0" max="9999999999.99999999" step="0.00000001" value="${form.stake || '0'}">
          ${currency_html}
        </div>`;
  }

  return `
    <form class="saito-overlay-form" id="stake-crypto-request-container">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Play for Crypto</h2>
      </header>

      <div class="game-stake">
        ${stake_heading_html}
        ${stake_inputs_html}
        <div class="stake-input-error" id="stake-amount-error"></div>
      </div>

      <div class="saito-button-row stake-confirm-row">
        <button type="button" class="saito-button-primary" id="enable_staking_yes">Confirm</button>
      </div>
    </form>
  `;
};
