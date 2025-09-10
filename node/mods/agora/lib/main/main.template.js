module.exports = (app, mod, this_self) => {
  console.log('this_self: ', this_self);

  let html = `
    <div class="saito-container" id="saito-container">

      <div class="saito-sidebar left">
        <div class="saito-button-primary list-asset">list asset</div>
      </div>

      <div class="saito-main">
        <div id="agora-empty">No items for auction yet —— be the first to list one.</div>
        <div class="agora-table">
          <div id="agora-table-title">Assets for sale</div>
          <div class="agora-table-list"></div>
  `;

  // <div class="agora-nft"></div>
  // <div class="agora-nft"></div>
  // <div class="agora-nft"></div>
  // <div class="agora-nft"></div>
  // <div class="agora-nft"></div>

  // if (typeof this_self.records != 'undefined') {
  //   for (let i=0; i<this_self.records.length; i++ ){
  //     console.log("nft:", this_self.records[i]);
  //     html+= `<div class="agora-nft">${i}</div>`;

  //   }
  // }

  html += `
        </div>
      </div>


    </div>

  `;

  return html;
};
