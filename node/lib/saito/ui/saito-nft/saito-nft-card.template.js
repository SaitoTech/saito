module.exports = (app, mod, nft) => {
  let identicon = '';
  if (nft.id == null || nft.id == '') {
    console.warn('NFT id not found: ', nft);
    identicon = app.keychain.returnIdenticon('');
  } else {
    identicon = app.keychain.returnIdenticon(nft.id);
  }

  let html = `
      <div class="nft-card" id="nft-card-${nft.uuid}">
      <div class="nft-card-title">${nft.title}</div>
      <div class="nft-card-img"></div>

         <div class="nft-card-info">
            <div class="nft-card-details">
               <div class="nft-card-amount">
                  <div class="nft-card-info-title">Units</div>
                  <div class="nft-card-info-amount">${nft.getTotalAmount()}${nft.getSlipCount() > 1 ? ` / ${nft.getSlipCount()} ` : ''}</div>
               </div>
               <div class="nft-card-deposit">
                  <div class="nft-card-info-title">Type</div>
                  <div class="nft-card-info-deposit">${nft.returnType()}</div>
               </div>
               <img class="nft-identicon" src="${identicon}" />
            </div>
         </div>
      </div>
   `;

  return html;
};
