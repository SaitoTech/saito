module.exports = (app, self) => {

  let default_bet = Math.min(self.match_stake, self.max_stake);

  return `  
  <div class="saito-crypto-transfer" id="approve-crypto-request-container">
    
    <h2 class="auth-title">Enable In-Game Crypto</h2>
    <div class="stake-input-container">
        <input autocomplete="off" id="amount_to_stake_input" class="saito-input stake" 
          type="number" min="${self.min_stake}" max="${self.max_stake}" step="0.00000001" value="${default_bet}" >
        <div class="crypto_msg">
          <div class="select_min">Min: ${self.min_stake}</div>
          <div class="select_match ${(self.max_stake < self.match_stake) ? "nomatch" : ""}">Match: ${self.match_stake}</div>
          <div class="select_max">Max: ${Math.round(1000 * self.max_stake) / 1000}</div>
        </div>
        <div class="crypto-ticker">${self.ticker}</div>
        <div class="stake-input-error" id="stake-amount-error"></div>
    </div>
    <div class="crypto-stake-confirm-container">
      <input class="saito-checkbox" type="checkbox" checked name="crypto-stake-confirm-input" id="approve-crypto-stake-confirm-input">
      <label for="approve-crypto-stake-confirm-input" class="commentary">authorize in-game crypto transfer</label>
    </div>

    <div class="crypto-stake-offer-btn-container">
      <div class="saito-button-primary crypto-transfer-btn secondary" id="enable_staking_no">no, thanks</div>
      <div class="saito-button-primary crypto-transfer-btn" id="enable_staking_yes">yes, i'm in</div>
    </div>
  </div>
  `;
};
