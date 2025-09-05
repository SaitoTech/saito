module.exports = (app, mod) => {
  let balance = Number(mod.returnBalance());

  let html = `
    <div class="crypto-details-overlay">
        <div class="saito-overlay-form-header flex-header">
            <div class="crypto-logo-container"><img class="crypto-logo" src="/${mod.ticker.toLowerCase()}/img/logo.png"></div>
            <div class="saito-overlay-form-header-title">${mod.name}</div>
            ${
              mod.address
                ? `<div class="mobile-only460 pubkey-container">
                             <div class="profile-public-key" id="profile-public-key" data-add="${mod.address}">${mod.address.slice(0, 6)}...${mod.address.slice(-6)}</div>
                             <i class="fas fa-copy"></i>
                          </div>
            `
                : ''
            }
        </div>
        <div class="wallet-details">
        <h6>My Wallet</h6>`;

  if (!mod.isActivated()) {
    html += `<div id="activate-now" class="saito-anchor"><span>activate now</span></div>`;
  } else {
    html += `          
            <div class="deposit-address">
              <div id="qrcode2" class="qrcode"></div>
              <div class="pubkey-container">
                 <div class="profile-public-key" id="profile-public-key" data-add="${mod.address}">${mod.address.slice(0, 8)}...${mod.address.slice(-8)}</div>
                 <i class="fas fa-copy"></i>
              </div>
            </div>
             
           <div class="wallet-actions">
               <div class="main-balance">
                 <div class="label">${mod?.pending_balance ? 'Available ' : ''}Balance:</div>
                 <div class="balance-amount">${app.browser.returnBalanceHTML(mod.returnBalance())}</div>
                 <i id="check-balance" class="fa-solid fa-arrows-rotate refresh"></i>
               </div>`;
    if (mod.ticker == 'SAITO') {
      if (mod.pending_balance) {
        html += `<div><div class="label">Pending Balance:</div>
                  <div class="balance-amount">${app.browser.returnBalanceHTML(mod.pending_balance)}</div></div>`;
      } else {
        html += '<div></div>';
      }

      html += `
        <div class="saito-button-grid">
          <button class="saito-button-secondary" id="get-saito">get saito</button>
          <button class='saito-button-primary ${balance > 0 ? '' : 'disabled'}' id='send-crypto'>Send</button>
        </div>
      `;
    } else {
      let menu_html = '';
      /*
      if (mod.exchange_rate && balance) {
        menu_html = `
              <div class="label">Value:</div>
              <div class="header-crypto-value">≈ ${app.browser.formatDecimals(balance * mod.exchange_rate)} $SAITO</div></div>`;
      }*/

      html += `
          <div>${menu_html}</div>
          <div class="saito-button-grid">
            ${/*balance > 0 ? `<button class="saito-button-secondary" id="convert-saito">convert</button>` : */ '<div></div>'}
            <button class='saito-button-primary ${balance > 0 ? '' : 'disabled'}' id='send-crypto'>Send</button>
          </div>
        `;
    }

    html += `</div>`;
  }

  html += `</div>

        <div class="transaction-history">
          <i id="check-history" class="fa-solid fa-arrows-rotate refresh"></i>
          <h6>Transaction History</h6>
          <div class="transaction-history-table saitox-table">
              <div class="saitox-header-item">Time</div>
              <div class="saitox-header-item">Type</div>
              <div class="saitox-header-item">Amount</div>
              <div class="saitox-header-item">Balance</div>
              <div class="saitox-header-item">To/From</div>
          </div>
          <nav class="pagination-container disabled">
            <div class="pagination-button disabled" id="prev-button" aria-label="Previous page" title="Previous page">&lt;</div>
            <div id="pagination-numbers"></div>
            <div class="pagination-button disabled" id="next-button" aria-label="Next page" title="Next page">&gt;</div>
          </nav>
        </div>
    </div>
  `;

  return html;
};
