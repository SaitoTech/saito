module.exports = (app, rows) => {
  let html = `
      <form id="login-template" class="saito-recovery">
        <div class="saito-overlay-form-header">
          <div class="saito-overlay-form-header-title">Select Account</div>
        </div>
        <div class="saito-overlay-form-text">Your login credentials are associated with multiple wallets, please select the one your want</div>
        <div class='wallet-selection saito-menu-select-subtle'>
        </div>
      </form>`;

  return html;
};
