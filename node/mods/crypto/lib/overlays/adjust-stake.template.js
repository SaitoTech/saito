module.exports = (app, self) => {
  let default_bet = Math.min(self.match_stake, self.max_stake);

  return `
  <form class="saito-overlay-form" id="approve-crypto-request-container">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">Enable In-Game Crypto</h2>
    </header>

    <div class="amount-row">
      <input autocomplete="off" id="amount_to_stake_input" class="saito-input" type="number" min="${self.min_stake}" max="${self.max_stake}" step="0.00000001" value="${default_bet}">
      <div class="currency"><span>${self.ticker}</span></div>
    </div>
    <div>
      <button type="button" class="saito-button-secondary small select_min">Min: ${self.min_stake}</button>
      <button type="button" class="saito-button-secondary small select_match ${self.max_stake < self.match_stake ? 'nomatch' : ''}">Match: ${self.match_stake}</button>
      <button type="button" class="saito-button-secondary small select_max">Max: ${Math.round(1000 * self.max_stake) / 1000}</button>
    </div>
    <div class="stake-input-error" id="stake-amount-error"></div>

    <div class="saito-button-row stake-confirm-row">
      <button type="button" class="saito-button-secondary" id="enable_staking_no">no, thanks</button>
      <button type="button" class="saito-button-primary" id="enable_staking_yes">yes, i'm in</button>
    </div>
  </form>
  `;
};
