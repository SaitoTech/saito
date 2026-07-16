module.exports = (app, mod, nft_overlay) => {
  let nft = nft_overlay.nft;

  let text = '';
  if (nft.text) {
    text = nft.text;
  }
  if (nft.css) {
    text = nft.css;
  }
  if (nft.js) {
    text = nft.js;
  }
  if (nft.json) {
    text = nft.json;
  }

  let imageHtml = '';
  if (text == '') {
    imageHtml = `<div class="saito-nft-image" style="background-image:url('${nft?.image || '/saito/img/dreamscape.png'}')" ></div>`;
  } else {
    imageHtml = `<div class="saito-nft-image" style="background-image:url('${nft?.image || '/saito/img/dreamscape.png'}')" ><div class="saito-nft-text">${text}</div></div>`;
  }

  return `
    <div class="saito-nft-panel saito-nft-panel-view active">
      <div class="saito-nft-panel-body saito-nft-panel-body-view">
        <div class="saito-nft-image-wrapper">
          ${imageHtml}
        </div>
      </div>
      <div class="saito-nft-panel-footer">
        <button class="saito-nft-footer-btn enable-nft" style="display:none;">Enable</button>
        <button class="saito-nft-footer-btn disable-nft" style="display:none;">Disable</button>
        <button class="saito-nft-footer-btn sell-nft" style="display:none;">Sell on Store</button>
        <button class="saito-nft-footer-btn send-nft">Transfer</button>
      </div>
    </div>
  `;
};
