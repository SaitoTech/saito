module.exports = (app, mod, deposit_self) => {
  let html = `
        <div id="saito-deposit-form" class="saito-overlay-form saito-crypto-deposit-container">
            <div class="saito-overlay-form-header">
                <div class="saito-overlay-form-header-title">${deposit_self.title}</div>
            </div>
           <div class="saito-crypto-wallet-state">`;
  if (!deposit_self.migration) {
    html += `<div class="wallet-balance">
                   <div class="balance-amount">0</div>
                   <div class="deposit-ticker">${deposit_self.ticker}</div>
               </div>`;
  }
  html += `<div id="deposit-qrcode" class="qrcode"></div>
               <div class="pubkey-containter">
                   <div class="profile-public-key" id="profile-public-key">
                        ${deposit_self.address.slice(0, 8)}...${deposit_self.address.slice(-8)}
                    </div>
                   <i class="fas fa-copy"></i>
               </div>
           </div>

           `;

  if (deposit_self?.desired_amount) {
    html += `<div class="call-to-action">deposit ${deposit_self.desired_amount} to continue</div>`;
  } else if (deposit_self?.warning) {
    html += `<div class="call-to-action">${deposit_self.warning}</div>`;
  }

  html += `
        <div class="saito-button-row">
           <div class="network-confirmations">
                <span class="network-confirmations-count">0</span> network confirmations
           </div>
           <button type="button" class="saito-button-primary" id='submit'>Done</button> 
        </div>

        </div>

    `;

  return html;
};
