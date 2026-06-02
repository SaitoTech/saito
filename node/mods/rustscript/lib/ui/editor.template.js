module.exports = (role) => {
  const title = role === 'test' ? 'Test Script' : 'Create Script';
  const paneClass = role === 'test' ? 'rs-unlocking-pane' : 'rs-locking-pane';
  return `
<h2 class="rustscript-editor-title rs-panel-title">${title}</h2>
<div class="rustscript-editor-guided rs-panel-semantic ${paneClass}" data-rs-editor-role="${role}"></div>
<textarea class="rustscript-editor-expert rs-panel-textarea" spellcheck="false" hidden></textarea>
`;
};
