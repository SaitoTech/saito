module.exports = (app, mod, nft) => {
  let identicon = '';
  if (nft.id == null || nft.id == '') {
    console.warn('NFT id not found: ', nft);
    identicon = app.keychain.returnIdenticon('');
  } else {
    identicon = app.keychain.returnIdenticon(nft.id);
  }

  let html = `
      <article class="saito-nft-card" id="nft-card-${nft.uuid}">
      <div class="saito-nft-card-title">${nft.title}</div>
      <div class="saito-nft-card-img"></div>

         <div class="saito-nft-card-details">
            <div class="saito-nft-card-amount">
               <div class="saito-nft-card-info-title">Units</div>
               <div class="saito-nft-card-info-amount">${nft.getTotalAmount()}${nft.getSlipCount() > 1 ? ` / ${nft.getSlipCount()} ` : ''}</div>
            </div>
            <div class="saito-nft-card-deposit">
               <div class="saito-nft-card-info-title">Type</div>
               <div class="saito-nft-card-info-deposit">${nft.returnType()}</div>
            </div>
            <img class="nft-identicon" src="${identicon}" />
         </div>
      </article>
   `;

  return html;
};
