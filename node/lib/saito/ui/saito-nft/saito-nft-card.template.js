module.exports = (app, mod, nft) => {
  const units = Number(nft.getTotalAmount()).toLocaleString();
  const can_toggle = !!(nft.css || nft.js || nft.returnType() === 'saito-app');
  const enabled = (app.options?.permissions?.nfts || []).includes(nft.tx_sig);
  const current = enabled ? 'Enabled' : 'Disabled';
  const alt = enabled ? 'Disabled' : 'Enabled';
  const toggle = can_toggle
    ? `<div class="saito-nft-card-toggle${enabled ? ' enabled' : ''}"><div class="saito-nft-card-toggle-face"><span class="saito-nft-card-toggle-dot${
        enabled ? ' enabled' : ''
      }"></span><span class="saito-nft-card-toggle-label">${current}</span><i class="fa-solid fa-caret-down"></i></div><div class="saito-nft-card-toggle-menu"><div class="saito-nft-card-toggle-option saito-nft-card-toggle-current"><span class="saito-nft-card-toggle-dot${
        enabled ? ' enabled' : ''
      }"></span><span class="saito-nft-card-toggle-label">${current}</span><i class="fa-solid fa-caret-down"></i></div><div class="saito-nft-card-toggle-option"><span class="saito-nft-card-toggle-dot${
        enabled ? '' : ' enabled'
      }"></span><span class="saito-nft-card-toggle-label">${alt}</span></div></div></div>`
    : '';

  let html = `
      <article class="saito-nft-card" id="nft-card-${nft.uuid}">
      <div class="saito-nft-card-title">${nft.title}</div>
      <div class="saito-nft-card-img"></div>

         <div class="saito-nft-card-details">
            <div class="saito-nft-card-amount">Units ${units}</div>
            ${toggle}
         </div>
      </article>
   `;

  return html;
};
