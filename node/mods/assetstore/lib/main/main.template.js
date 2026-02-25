module.exports = (app, mod, this_self) => {
  return `
    <div class="saito-container" id="saito-container">

      <div class="saito-sidebar left">
        <div class="saito-button-primary list-asset">list asset</div>
        <div class="saito-store-explorer">
          <div class='saito-store-page-tab' data-pkey='${mod.SAITO_OFFICIAL_PUBLICKEY}'>home</div>
          <div class='saito-store-page-tab' data-pkey='${mod.publicKey}'>my store</div>
        </div>
      </div>

      <div class="saito-main">
        <div id="assetstore-empty">No items for auction yet —— be the first to list one.</div>
        <div class="assetstore-table">
          <div class="assetstore-table-list"></div>
        </div>
      </div>
    </div>
  `;
};
