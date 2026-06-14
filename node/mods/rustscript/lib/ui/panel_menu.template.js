/** Recessed panel action menu — extensible list of advanced actions. */
module.exports = function panelMenuMarkup(menuId = 'panel') {
  return `
<div class="rs-panel-menu" data-rs-panel-menu="${menuId}">
  <button type="button" class="rs-panel-menu-trigger" aria-label="More actions" aria-haspopup="menu" aria-expanded="false" aria-controls="rs-panel-menu-${menuId}">
    <i class="fa-solid fa-ellipsis rs-panel-menu-trigger-icon" aria-hidden="true"></i>
  </button>
  <div class="rs-panel-menu-dropdown" id="rs-panel-menu-${menuId}" role="menu" hidden>
    <button type="button" class="rs-panel-menu-item" role="menuitem" data-action="export">Export</button>
  </div>
</div>`;
};
