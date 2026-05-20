module.exports = async (app, mod) => {
  let available_balance = await mod.getAvailableBalance();
  let pending_balance = await mod.getPendingBalance();
  let available_balance_num = Number(available_balance);
  let pending_balance_num = Number(pending_balance);
  let rtn_val = mod.returnLogos();
  let logo = rtn_val.img;
  let sublogo = rtn_val.sub_logo;

  let html = `
    <div class="crypto-details-overlay ">
        <div class="saito-overlay-form-header">
            <div class="crypto-logo-container">
              <img class="crypto-logo" src="${logo}">
              ${sublogo ? `<img class="chain-logo" src="${sublogo}">` : ''}
            </div>
            <div class="saito-overlay-form-header-title">${mod.name}</div>
            ${
              mod.address
                ? `<div class="mobile-only460 pubkey-container">
                    <div class="profile-public-key" id="profile-public-key" data-add="${mod.address}">${mod.address.slice(0, 6)}...${mod.address.slice(-6)}</div>
                    <i class="fas fa-copy"></i>
                  </div>`
                : ''
            }
        </div>
        <div class="wallet-details">
  `;

  if (!mod.isActivated()) {
    html += `
            <div id="activate-now" class="saito-anchor">
              <span>activate now</span>
            </div>
            <div id="saito-details-loader"></div>
        </div>
    </div>`;
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
    `;

    if (pending_balance_num !== available_balance_num) {
      html += `
                <div class="label">Pending Balance:</div>
                <div class="balance-amount">${app.browser.returnBalanceHTML(pending_balance, true)}</div>
                <i id="check-balance" class="fa-solid fa-arrows-rotate refresh"></i>
              </div>
    `;
    } else {
      html += `
                <div class="label">Available Balance:</div>
                <div class="balance-amount">${app.browser.returnBalanceHTML(available_balance, true)}</div>
                <i id="check-balance" class="fa-solid fa-arrows-rotate refresh"></i>
              </div>
    `;
    }

    if (mod.ticker == 'SAITO') {
      html += `
              <div class="saito-button-row auto-size force-row">
                <div class="get-saito-tokens"></div>
                <button class="saito-button-secondary" id="get-saito">get saito</button>
                <button class='saito-button-primary ${available_balance > 0 ? '' : 'disabled'}' id='send-crypto'>Send</button>
              </div>
      `;
    } else {
      let menu_html = '';

      html += `
              <div>${menu_html}</div>
              <div class="saito-button-grid">
                <div></div>
                <div></div>
                <button class='saito-button-primary ${available_balance > 0 ? '' : 'disabled'}' id='send-crypto'>Send</button>
              </div>
      `;
    }

    html += `
            </div>
        </div>

        <div class="transaction-history">
          <i id="check-history" class="fa-solid fa-arrows-rotate refresh"></i>
          <h6>Transaction History</h6>
          <div class="transaction-history-table saitox-table" data-crypto="${mod.ticker}">
            <div class="saitox-header-item">Time</div>
            <div class="saitox-header-item">Type</div>
            <div class="saitox-header-item">Amount</div>
            <div class="saitox-header-item">Balance</div>
            <div class="saitox-header-item">To/From</div>
            <div class="saitox-header-item saito-only">Memo</div>
          </div>
          <nav class="pagination-container disabled">
            <div class="pagination-button disabled" id="prev-button" aria-label="Previous page" title="Previous page">&lt;</div>
            <div id="pagination-numbers"></div>
            <div class="pagination-button disabled" id="next-button" aria-label="Next page" title="Next page">&gt;</div>
          </nav>
        </div>
      </div>
    `;
  }

  return html;
};
