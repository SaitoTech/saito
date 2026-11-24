function escapeText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fieldControl(field, prefs) {
  const checked = Number(prefs[field.key]) === 1 ? ' checked' : '';
  return `<label><input class="saito-checkbox" type="checkbox" data-display="${field.key}"${checked}> ${escapeText(field.label)}</label>`;
}

function sortHeader(field, view) {
  const active = view.sortKey === field.key;
  const arrow = active ? (view.sortDirection === 'desc' ? ' ↓' : ' ↑') : '';
  const aria = active ? (view.sortDirection === 'desc' ? 'descending' : 'ascending') : 'none';
  return `<button type="button" class="popup-vocab-sort${active ? ' is-active' : ''}" data-sort="${field.key}" aria-sort="${aria}">${escapeText(field.label)}${arrow}</button>`;
}

function sidebar(view) {
  return `
    <div class="popup-vocab-sidebar">
      <fieldset class="popup-display-controls">
        <legend>Display</legend>
        ${view.displayFields.map((field) => fieldControl(field, view.prefs)).join('')}
      </fieldset>
      <button type="button" class="popup-vocab-action popup-vocab-review" data-action="review">Start Review</button>
    </div>
  `;
}

function page(view) {
  const columns = Math.max(view.fields.length, 1);
  const headerCells = view.fields.map((field) => sortHeader(field, view)).join('');
  const rows = view.rows
    .map((row) => {
      const checked = view.selected.has(row.id) ? ' checked' : '';
      const cells = row.cells
        .map((cell) => {
          const stat = cell.stat ? ' popup-vocab-stat' : '';
          return `<span class="popup-vocab-cell${cell.chinese ? ' popup-vocab-chinese' : ''}${stat}">${escapeText(cell.text)}</span>`;
        })
        .join('');
      return `
        <div class="popup-vocab-row${checked ? ' is-selected' : ''}" role="row" data-id="${row.id}">
          <label class="popup-vocab-check">
            <input class="popup-vocab-pick saito-checkbox" type="checkbox" value="${row.id}" aria-label="Select ${escapeText(row.label)}"${checked}>
          </label>
          ${cells}
        </div>`;
    })
    .join('');

  const range =
    view.total === 0 ? '0 vocabulary entries' : `${view.start + 1}–${view.end} of ${view.total}`;

  const pageSizes = view.pageSizes
    .map((size) => {
      const selected = size === view.pageSize ? ' selected' : '';
      return `<option value="${size}"${selected}>${size}</option>`;
    })
    .join('');

  const toolbar = view.selected.size
    ? `<div class="popup-vocab-toolbar" role="toolbar" aria-label="Selected vocabulary">
        <span class="popup-vocab-selection">${view.selected.size} selected</span>
        <button type="button" class="popup-vocab-action" data-action="delete">Delete Selected</button>
        <button type="button" class="popup-vocab-action" data-action="review-selected">Review Selected</button>
      </div>`
    : '';

  const body = view.total
    ? `<div class="popup-vocab-scroll">
        <div class="popup-vocab-sheet" style="--popup-vocab-cols:${columns}" role="table">
          <div class="popup-vocab-row popup-vocab-columns" role="row">
            <span class="popup-vocab-check" aria-hidden="true"></span>
            ${headerCells}
          </div>
          ${rows}
        </div>
      </div>`
    : '<p class="popup-vocab-empty">No saved vocabulary yet.</p>';

  return `
    <div class="popup-vocab-manager">
      ${toolbar}
      <p class="popup-vocab-notice" role="status">${escapeText(view.notice)}</p>
      ${body}
      <div class="popup-vocab-pager">
        <button type="button" class="popup-vocab-action" data-action="prev"${view.page <= 0 ? ' disabled' : ''}>Previous</button>
        <span class="popup-vocab-page-label">Page ${view.page + 1} of ${view.pages}</span>
        <button type="button" class="popup-vocab-action" data-action="next"${view.page + 1 >= view.pages ? ' disabled' : ''}>Next</button>
        <label class="popup-vocab-page-size">Show
          <select data-action="page-size">${pageSizes}</select>
        </label>
        <span class="popup-vocab-range">${range}</span>
      </div>
    </div>
  `;
}

page.sidebar = sidebar;
module.exports = page;
