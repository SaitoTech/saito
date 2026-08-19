module.exports = (app, mod, sobj) => {
  return `
  <form class="saito-overlay-form" id="approve-crypto-request-container">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">Play for Crypto</h2>
    </header>

    <div class="stake">
      <span class="stake-amount">${sobj.stake} ${sobj.ticker}</span>
    </div>

    <div class="saito-button-row stake-confirm-row">
      <button type="button" class="saito-button-secondary" id="enable_staking_no">No, thanks</button>
      <button type="button" class="saito-button-primary" id="enable_staking_yes">Yes, I'm in</button>
    </div>
  </form>
  `;
};
