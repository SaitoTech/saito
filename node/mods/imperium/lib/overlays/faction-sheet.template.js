module.exports = (imperium_self, player, faction_name, tabs, active_tab) => {
  let tab_html = tabs
    .map((tab) => {
      let active = tab.id === active_tab ? ' active' : '';
      return `<button type="button" class="faction-sheet-tab${active}" data-tab="${tab.id}">${tab.label}</button>`;
    })
    .join('');

  return `
  <div class="faction-sheet p${player}" data-player="${player}">
    <div class="faction-sheet-tabs" role="tablist">
      ${tab_html}
    </div>
    <div class="faction-sheet-dossier">
      <div class="faction-sheet-header">
        <div class="faction-sheet-title">${faction_name}</div>
        <div class="faction-sheet-tokenbar"></div>
      </div>
      <div class="faction-sheet-body"></div>
    </div>
  </div>
  `;
};
