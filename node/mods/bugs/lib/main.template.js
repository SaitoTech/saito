const { STATUS_LABELS, SEVERITY_LABELS, PRIORITY_LABELS } = require('./constants');

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const selectOptions = (labels, emptyLabel) =>
  `<option value="">${emptyLabel}</option>${Object.entries(labels)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('')}`;

const selectedOptions = (labels, selected) =>
  Object.entries(labels)
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
    )
    .join('');

const address = (publicKey) =>
  publicKey
    ? `<span class="saito-address" data-id="${escapeHtml(publicKey)}">${escapeHtml(publicKey)}</span>`
    : '<span aria-label="Unassigned">—</span>';

const formatDate = (timestamp) => {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

const dateTime = (timestamp) => {
  const date = new Date(Number(timestamp));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const row = (bug, canEdit) => `
  <article class="bug-row" data-id="${escapeHtml(bug.root_tx_sig)}" draggable="${
    canEdit ? 'true' : 'false'
  }">
    <button class="bug-row-open" aria-label="Open ${escapeHtml(bug.title)}">
      <span class="bug-row-title">${escapeHtml(bug.title)}</span>
    </button>
    <span class="bug-row-status">${escapeHtml(STATUS_LABELS[bug.status] || bug.status)}</span>
    <span class="bug-row-severity">${escapeHtml(
      SEVERITY_LABELS[bug.severity] || bug.severity
    )}</span>
    <span class="bug-row-priority">${escapeHtml(PRIORITY_LABELS[bug.priority] || bug.priority)}</span>
    <span class="bug-row-assignee">${address(bug.assignee_publickey)}</span>
    <span class="bug-row-reporter">${address(bug.reporter_publickey)}</span>
    <time class="bug-row-updated" datetime="${dateTime(bug.updated_at)}">${escapeHtml(
      formatDate(bug.updated_at)
    )}</time>
    <span class="bug-row-replies" aria-label="${Number(bug.reply_count || 0)} replies"><i class="fa-regular fa-comment"></i> ${Number(
      bug.reply_count || 0
    )}</span>
    ${
      canEdit
        ? `<div class="bug-row-order" aria-label="Bug actions">
             <button class="bug-row-up saito-button-secondary small" title="Move up" aria-label="Move ${escapeHtml(
               bug.title
             )} up"><i class="fa-solid fa-arrow-up"></i></button>
             <button class="bug-row-down saito-button-secondary small" title="Move down" aria-label="Move ${escapeHtml(
               bug.title
             )} down"><i class="fa-solid fa-arrow-down"></i></button>
             <button type="button" class="bug-row-edit saito-button-secondary small" title="Edit metadata" aria-label="Edit ${escapeHtml(
               bug.title
             )} metadata"><i class="fa-solid fa-pen"></i></button>
           </div>`
        : ''
    }
  </article>`;

const candidates = (mod, view) => {
  if (view === 'completed') return '';
  const rows = [...mod.discoveredCandidates.values()].filter(
    (candidate) => mod.clientBugs.get(candidate.root_tx_sig)?.tracked !== 1
  );
  if (!rows.length) return '';
  return `<section class="bugs-discovered" aria-labelledby="bugs-discovered-title">
    <h2 id="bugs-discovered-title">Discovered #bug tweets</h2>
    ${rows
      .map(
        (candidate) => `<div class="bugs-candidate">
          <div><strong>${escapeHtml(candidate.title)}</strong>${address(
            candidate.reporter_publickey
          )}</div>
          <button class="bugs-candidate-capture saito-button-secondary" data-id="${escapeHtml(
            candidate.root_tx_sig
          )}">Capture</button>
        </div>`
      )
      .join('')}
  </section>`;
};

const list = (state, mod) => `
  <main class="bugs-main">
    <header class="bugs-toolbar">
      <h1>Bugs</h1>
      <button class="bugs-create saito-button-primary"><i class="fa-solid fa-plus"></i> Create Bug</button>
    </header>
    <div class="bugs-view-toggle" role="group" aria-label="Bug views">
      <label><input class="bugs-view-input saito-checkbox" data-view="active" type="checkbox"
        ${state.filters.view !== 'completed' ? 'checked' : ''} /> Active</label>
      <label><input class="bugs-view-input saito-checkbox" data-view="completed" type="checkbox"
        ${state.filters.view !== 'active' ? 'checked' : ''} /> Completed</label>
    </div>
    <form class="bugs-filters" aria-label="Filter bugs">
      <label>Search<input class="saito-input" type="search" name="search" value="${escapeHtml(
        state.filters.search
      )}" /></label>
      <label>Status<select class="saito-form-select" name="status">${selectOptions(
        STATUS_LABELS,
        'Any status'
      )}</select></label>
      <label>Severity<select class="saito-form-select" name="severity">${selectOptions(
        SEVERITY_LABELS,
        'Any severity'
      )}</select></label>
      <label>Priority<select class="saito-form-select" name="priority">${selectOptions(
        PRIORITY_LABELS,
        'Any priority'
      )}</select></label>
      <label>Assignee<input class="saito-input" name="assignee_publickey" value="${escapeHtml(
        state.filters.assignee_publickey
      )}" /></label>
      <label>Creator<input class="saito-input" name="reporter_publickey" value="${escapeHtml(
        state.filters.reporter_publickey
      )}" /></label>
      <label>Sort<select class="saito-form-select" name="sort">
        <option value="weight">Manual</option><option value="updated">Updated</option>
        <option value="created">Created</option><option value="severity">Severity</option>
        <option value="priority">Priority</option>
      </select></label>
    </form>
    ${candidates(mod, state.filters.view)}
    <div class="bugs-list" role="list" aria-live="polite">
      ${
        state.loading
          ? '<div class="bugs-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading bugs…</div>'
          : state.error
            ? `<div class="bugs-state" role="alert">${escapeHtml(state.error)}</div>`
            : state.bugs.length
              ? state.bugs
                  .map((bug) =>
                    row(
                      bug,
                      mod.canCurrentUserEdit(bug) &&
                        state.filters.sort === 'weight' &&
                        !state.filters.status &&
                        !state.filters.severity &&
                        !state.filters.priority &&
                        !state.filters.assignee_publickey &&
                        !state.filters.reporter_publickey &&
                        !state.filters.search
                    )
                  )
                  .join('')
              : '<div class="bugs-state">No bugs match this view.</div>'
      }
    </div>
  </main>`;

const detail = (bug, mod) => {
  const canEdit = mod.canCurrentUserEdit(bug);
  return `<main class="bugs-main bug-detail" data-id="${escapeHtml(bug.root_tx_sig)}">
    <header class="bug-detail-header">
      <button type="button" class="bug-detail-back saito-button-square" aria-label="Back to all bugs" title="Back to all bugs"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
      <h1>${escapeHtml(bug.title)}</h1>
      ${
        canEdit
          ? '<button type="button" class="bug-detail-edit saito-button-square" aria-label="Edit bug" title="Edit bug"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>'
          : ''
      }
      ${
        canEdit
          ? '<button type="button" class="bug-detail-delete saito-button-square" aria-label="Remove bug from Bugs" title="Remove from Bugs"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>'
          : ''
      }
      <button type="button" class="bug-detail-open-redsquare saito-button-square" aria-label="Open in RedSquare" title="Open in RedSquare"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button>
    </header>
    <dl class="bug-detail-metadata">
      <div><dt>${canEdit ? '<label for="bug-detail-status">Status</label>' : 'Status'}</dt><dd>${
        canEdit
          ? `<select id="bug-detail-status" class="bug-detail-status saito-form-select">${selectedOptions(
              STATUS_LABELS,
              bug.status
            )}</select>`
          : escapeHtml(STATUS_LABELS[bug.status] || bug.status)
      }</dd></div>
      <div><dt>${canEdit ? '<label for="bug-detail-severity">Severity</label>' : 'Severity'}</dt><dd>${
        canEdit
          ? `<select id="bug-detail-severity" class="bug-detail-severity saito-form-select">${selectedOptions(
              SEVERITY_LABELS,
              bug.severity
            )}</select>`
          : escapeHtml(SEVERITY_LABELS[bug.severity] || bug.severity)
      }</dd></div>
      <div><dt>${canEdit ? '<label for="bug-detail-priority">Priority</label>' : 'Priority'}</dt><dd>${
        canEdit
          ? `<select id="bug-detail-priority" class="bug-detail-priority saito-form-select">${selectedOptions(
              PRIORITY_LABELS,
              bug.priority
            )}</select>`
          : escapeHtml(PRIORITY_LABELS[bug.priority] || bug.priority)
      }</dd></div>
      <div><dt>Reporter</dt><dd>${address(bug.reporter_publickey)}</dd></div>
      <div><dt>Assignee</dt><dd>${address(bug.assignee_publickey)}</dd></div>
      <div><dt>Created</dt><dd>${escapeHtml(formatDate(bug.created_at))}</dd></div>
      <div><dt>Updated</dt><dd>${escapeHtml(formatDate(bug.updated_at))}</dd></div>
    </dl>
    <section class="bug-thread" aria-label="RedSquare bug thread">
      <div class="bugs-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading RedSquare thread…</div>
    </section>
    <button class="bug-detail-reply saito-button-primary">Reply in RedSquare</button>
  </main>`;
};

module.exports = { list, detail };
