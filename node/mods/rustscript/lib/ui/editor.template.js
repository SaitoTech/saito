const PanelMenu = require('./panel_menu');

module.exports = (role) => {
  const title = role === 'test' ? 'Test Script' : 'Create Script';
  const menuId = role === 'test' ? 'script-test' : 'script-create';
  return `
<header class="rs-panel-header">
  <h2 class="rs-panel-title">${title}</h2>
  ${PanelMenu.shouldShowForScriptPanel() ? PanelMenu.markup(menuId) : ''}
</header>
<div class="rustscript-editor-guided" data-rs-editor-role="${role}"></div>
<textarea class="saito-textarea rustscript-editor-expert" spellcheck="false" hidden></textarea>
`;
};
