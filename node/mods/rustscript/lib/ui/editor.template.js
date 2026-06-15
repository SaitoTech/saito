const PanelMenu = require('./panel_menu');

module.exports = (role) => {
  const title = role === 'test' ? 'Test Script' : 'Create Script';
  const paneClass = role === 'test' ? 'rs-unlocking-pane' : 'rs-locking-pane';
  const menuId = role === 'test' ? 'script-test' : 'script-create';
  return `
<header class="rs-panel-header">
  <h2 class="rustscript-editor-title rs-panel-title">${title}</h2>
  ${PanelMenu.shouldShowForScriptPanel() ? PanelMenu.markup(menuId) : ''}
</header>
<div class="rustscript-editor-guided rs-panel-semantic rs-semantic-grid ${paneClass}" data-rs-editor-role="${role}"></div>
<textarea class="rustscript-editor-expert rs-panel-textarea" spellcheck="false" hidden></textarea>
`;
};
