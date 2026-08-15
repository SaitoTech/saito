module.exports = (app, sobj) => {
  return `
  <form class="saito-overlay-form">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">Inadequate ${sobj.ticker}</h2>
    </header>

    <div class="saito-overlay-form-text">
      <p>Some players do not have any ${sobj.ticker}.</p>
      <p>Once all players have ${sobj.ticker} available in their wallets you can use this method to propose a crypto-game.</p>
    </div>

    <div class="saito-button-row">
      <button type="button" class="saito-button-primary" id="exit_staking">understand</button>
    </div>
  </form>
  `;
};
