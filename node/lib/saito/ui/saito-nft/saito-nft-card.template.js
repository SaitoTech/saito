module.exports = (app, mod, nft) => {

  let identicon = '';
  if (nft.id == null || nft.id == '') {
    console.warn('NFT id not found: ', nft);
    identicon = app.keychain.returnIdenticon('');
  } else {
    identicon = app.keychain.returnIdenticon(nft.id);
  }

  let all_slips = nft.returnAllSlips();
  let total_amount = 0;
  for (let z = 0; z < all_slips.length; z++) {
    total_amount += parseInt(all_slips[z].slip1.amount);
  }

  const price = nft.getBuyPriceSaito();

  let html = `
      <div class="nft-card nfttxsig${nft.tx_sig}" id="nft-card-${nft.uuid}">
      <div class="nft-card-title">${nft.title}</div>
      <div class="nft-card-img"></div>

         <div class="nft-card-info">
            <div class="nft-card-details">
               <div class="nft-card-amount">
                  <div class="nft-card-info-title">Units</div>
                  <div class="nft-card-info-amount">${total_amount}</div>
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
