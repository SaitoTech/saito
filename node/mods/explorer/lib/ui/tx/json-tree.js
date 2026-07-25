function esc(app, value) {
  return app.browser.escapeHTML(String(value ?? ''));
}

function renderPrimitive(app, value) {
  if (value === null) {
    return `<span class="explorer-json-null">null</span>`;
  }
  if (typeof value === 'boolean') {
    return `<span class="explorer-json-bool">${value ? 'true' : 'false'}</span>`;
  }
  if (typeof value === 'number') {
    return `<span class="explorer-json-number">${esc(app, value)}</span>`;
  }
  return `<span class="explorer-json-string">"${esc(app, value)}"</span>`;
}

function renderJsonTree(app, value, key = null, depth = 0) {
  const keyHtml =
    key != null
      ? `<span class="explorer-json-key">"${esc(app, key)}"</span><span class="explorer-json-colon">: </span>`
      : '';

  if (value === null || typeof value !== 'object') {
    return `<div class="explorer-json-line">${keyHtml}${renderPrimitive(app, value)}</div>`;
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
  const open = isArray ? '[' : '{';
  const close = isArray ? ']' : '}';

  if (!entries.length) {
    return `<div class="explorer-json-line">${keyHtml}<span class="explorer-json-brace">${open}${close}</span></div>`;
  }

  const childId = `json-${Math.random().toString(36).slice(2, 10)}`;
  const children = entries
    .map(([entryKey, entryValue]) => renderJsonTree(app, entryValue, entryKey, depth + 1))
    .join('');

  return `
    <div class="explorer-json-node${depth === 0 ? ' explorer-json-root' : ''}" data-json-open="true">
      <div class="explorer-json-line explorer-json-line-toggle">
        <button type="button" class="explorer-json-toggle" aria-expanded="true" aria-controls="${childId}">
          <i class="fas fa-caret-down" aria-hidden="true"></i>
        </button>
        ${keyHtml}
        <span class="explorer-json-brace">${open}</span>
        <span class="explorer-json-meta">${entries.length} ${isArray ? 'items' : 'keys'}</span>
      </div>
      <div class="explorer-json-children" id="${childId}">
        ${children}
      </div>
      <div class="explorer-json-line"><span class="explorer-json-brace">${close}</span></div>
    </div>
  `;
}

module.exports = {
  renderJsonTree
};
