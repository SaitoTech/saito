module.exports = (app, mod, this_self) => {


  console.log("this_self: ", this_self);

  let html = `
    <div class="saito-container" id="saito-container">

      <div>Saito Asset Store</div>

      <div>
        <div class="assetstore-table">
          <div id="assetstore-empty">No items for auction yet—be the first to list one.</div>
          <div id="assetstore-table-title">Assets for sale</div>
          <div class="assetstore-table-list"></div>
  `;


          // <div class="assetstore-nft"></div>
          // <div class="assetstore-nft"></div>
          // <div class="assetstore-nft"></div>
          // <div class="assetstore-nft"></div>
          // <div class="assetstore-nft"></div>

      // if (typeof this_self.records != 'undefined') {
      //   for (let i=0; i<this_self.records.length; i++ ){
      //     console.log("nft:", this_self.records[i]);
      //     html+= `<div class="assetstore-nft">${i}</div>`;

      //   }
      // }


 
html += `
        </div>
      </div>

      <div>
        <div class="saito-button-primary list-asset">list asset</div>
      </div>

    </div>

  `;


  return html;

};