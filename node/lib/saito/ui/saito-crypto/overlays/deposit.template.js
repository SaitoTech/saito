module.exports = (app, mod, deposit_self) => {
  const migration_class = deposit_self.migration ? ' migration-deposit' : '';
  let html = `
        <div id="saito-deposit-form" class="saito-overlay-form saito-overlay-panel retain-surface saito-crypto-deposit saito-overlay-size narrow${migration_class}">
            <div class="saito-overlay-form-header">
                <div class="saito-overlay-form-header-title">${deposit_self.title}</div>
            </div>
           <section class="saito-crypto-wallet-state">`;

  if (deposit_self?.desired_amount) {
    html += `<div class="saito-crypto-deposit__amount">${deposit_self.desired_amount} ${deposit_self.ticker}</div>`;
  }

  html += `<div id="deposit-qrcode" class="qrcode"></div>
               <div class="pubkey-container">
                   <div class="profile-public-key" id="profile-public-key">
                        ${deposit_self.address.slice(0, 8)}...${deposit_self.address.slice(-8)}
                    </div>
                   <i class="fas fa-copy"></i>
               </div>
           </section>

           `;

  if (deposit_self?.warning) {
    html += `<div class="saito-overlay-form-text call-to-action">${deposit_self.warning}</div>`;
  }

  html += `
        <footer class="saito-button-row">
           <div class="saito-crypto-deposit__footer-meta">
             <div class="network-confirmations">
                  <span class="network-confirmations-count">0</span> network confirmations
             </div>
             <div class="get-saito-tokens"></div>
           </div>
           <button type="button" class="saito-button-primary" id='submit'>Done</button> 
        </footer>

        </div>

    `;

  return html;
};
