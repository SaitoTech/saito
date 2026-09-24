module.exports = () => {
  let html = `
      <div class="replacements-overlay" id="replacements-overlay">
        <div class="rp-header">
          <div class="rp-header-main">
            <div class="rp-header-icon" data-faction=""></div>
            <div class="rp-header-copy">
              <strong>Replacement Points</strong>
              <span class="rp-header-sub">Rebuild or repair units using replacement points.</span>
            </div>
          </div>
          <div class="points"></div>
        </div>
        <div class="rp-body">
          <div class="mainmenu">
            <div class="controls"></div>
          </div>
          <div class="submenu">
            <div class="controls"></div>
          </div>
        </div>
      </div>
  `;
  return html;
};
