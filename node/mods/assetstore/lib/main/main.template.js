module.exports = (app, mod, this_self) => {
  return `
    <div class="saito-container" id="saito-container">

      <div class="saito-sidebar left">
        <div class="saito-button-primary list-asset">list asset</div>
        <div class='saito-store-explorer-title'>
          <span>Stores</span>
          <div class='add-store store-absolute-icon'><i class="fa-solid fa-magnifying-glass-plus"></i></div>
        </div>
        <div class="saito-store-explorer saito-menu-select-heavy">
          <div class='saito-store-page-tab' data-pkey='${mod.SAITO_OFFICIAL_PUBLICKEY}'>
            <i class="fas fa-house"></i>
            <span>home</span>
          </div>
          <div class='saito-store-page-tab' data-pkey='${mod.publicKey}'>
            <i class="fa-solid fa-store"></i>
            <span>my store</span>
            <div class="store-link store-absolute-icon"><i class="fa-solid fa-link"></i></div>
          </div>
        </div>
        <select class="saito-store-explorer-mobile">
          <option value="${mod.SAITO_OFFICIAL_PUBLICKEY}">home</option>
          <option value="${mod.publicKey}">my store</option>
        </select>
        <div class="saito-store-mobile-header-icon">
          <div class='my-store'>
            <div class='store-link store-absolute-icon'><i class="fa-solid fa-link"></i></div>
          </div>
          <div class='other-store'></div>
          <div class='home-store'><div class='add-store store-absolute-icon'><i class="fa-solid fa-magnifying-glass-plus"></i></div></div>
        </div>
      </div>

      <div class="saito-main">
        <div id="assetstore-empty">No items for auction yet</div>
        <div class="assetstore-table">
          <div class="assetstore-table-list"></div>
        </div>
      </div>
    </div>
  `;
};
