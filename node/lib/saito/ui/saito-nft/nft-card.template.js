module.exports = (app, mod, self) => {
  let identicon = '';
  if (self.id == null || self.id == '') {
    console.warn('NFT id not found: ', self);
    identicon = app.keychain.returnIdenticon('');
  } else {
    identicon = app.keychain.returnIdenticon(self.id);
  }

  const depositSaito = app.wallet.convertNolanToSaito(self.deposit);

  let html = `

      <div class="nft-card" id="nft-card-${self.uuid}">
      <div class="nft-card-img"></div>

         <div class="nft-card-info">
            <div class="nft-card-details">
               <div class="nft-card-amount">
                  <div class="nft-card-info-title">qty</div>
                  <div class="nft-card-info-amount">${self.amount}</div>
               </div>
               <div class="nft-card-deposit">
                  <div class="nft-card-info-title">deposit</div>
                  <div class="nft-card-info-deposit">${app.browser.formatDecimals(depositSaito, true)} SAITO</div>
               </div>
               <img class="nft-identicon" src="${identicon}" />
            </div>
         </div>
      </div>
   `;

  return html;
};
