module.exports = (app, mod) => {
  let rtn_val = mod.returnLogos();
  let logo = rtn_val.img;
  let sublogo = rtn_val.sub_logo;

  let html = `
    <div class="saito-crypto-details ">
        <header class="saito-overlay-form-header">
            <div class="crypto-logo-container">
              <img class="crypto-logo" src="${logo}">
              ${sublogo ? `<img class="chain-logo" src="${sublogo}">` : ''}
            </div>
            <h2 class="saito-overlay-form-header-title">${mod.name}</h2>
            ${
              mod.address
                ? `<div class="mobile-only460 pubkey-container">
                    <div class="profile-public-key" id="profile-public-key" data-add="${mod.address}">${mod.address.slice(0, 6)}...${mod.address.slice(-6)}</div>
                    <i class="fas fa-copy"></i>
                  </div>`
                : ''
            }
        </header>
        <section class="wallet-details">
  `;

  if (!mod.isActivated()) {
    html += `
            <div id="activate-now" class="saito-anchor">
              <span>activate now</span>
            </div>
            <div id="saito-details-loader"></div>
        </section>
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
              <div class="main-balance">...</div>
    `;

    if (mod.ticker == 'SAITO') {
      html += `
              <div class="saito-button-row auto-size force-row">
                <div class="get-saito-tokens"></div>
                <button class="saito-button-secondary" id="get-saito">get saito</button>
                <button class='saito-button-primary' disabled id='send-crypto'>Send</button>
              </div>
      `;
    } else {
      html += `
              <div></div>
              <div class="saito-button-grid">
                <div></div>
                <div></div>
                <button class='saito-button-primary' disabled id='send-crypto'>Send</button>
              </div>
      `;
    }

    html += `
            </div>
        </section>

        <section class="transaction-history">
          <div class='transaction-grid-header'>
            <h6>Transaction History</h6>
            <button class="saito-button-secondary small" id='fetch-history'>refresh</button>
          </div>
          <div class="transaction-history-table saitox-table" data-crypto="${mod.ticker}">
            <div class="saitox-header-item">Time</div>
            <div class="saitox-header-item">Type</div>
            <div class="saitox-header-item">Amount</div>
            <div class="saitox-header-item">Balance</div>
            <div class="saitox-header-item">To/From</div>
            <div class="saitox-header-item saito-only">Memo</div>
          </div>
        </section>
      </div>
    `;
  }

  return html;
};
