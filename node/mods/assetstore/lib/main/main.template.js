module.exports = (app, mod, this_self) => {
  let html = `
    <div class="saito-container" id="saito-container">

      <div class="saito-sidebar left">
        <div class="saito-button-primary list-asset">list asset</div>
      </div>

      <div class="saito-main">
        <div id="assetstore-empty">No items for auction yet —— be the first to list one.</div>
        <div class="assetstore-table">
          <div id="assetstore-table-title">Assets for sale</div>
          <div class="assetstore-table-list"></div>
  `;

  html += `
        </div>
      </div>


    </div>

  `;

  return html;
};
