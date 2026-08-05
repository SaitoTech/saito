const { STATUS_LABELS, SEVERITY_LABELS, PRIORITY_LABELS } = require('../constants');

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const options = (labels, selected) =>
  Object.entries(labels)
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
    )
    .join('');

module.exports = (mode, values = {}, contentAvailable = false) => {
  const create = mode === 'create';
  const capture = mode === 'capture';
  const heading = create ? 'Create Bug' : capture ? 'Capture as Bug' : 'Edit Bug';
  return `
    <form class="saito-overlay-form bugs-editor bugs-editor-form" role="dialog" aria-labelledby="bugs-editor-title">
      <div class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title" id="bugs-editor-title">${heading}</h2>
      </div>
      ${
        create && !contentAvailable
          ? '<div class="saito-message-warning" role="alert">RedSquare composition is unavailable because the installed RedSquare module does not expose its composer API.</div>'
          : ''
      }
      <label>Bug title
        <input class="saito-input" name="title" maxlength="180" required value="${escapeHtml(
          values.title
        )}" />
      </label>
      <label>Status
        <select class="saito-form-select" name="status">${options(
          STATUS_LABELS,
          values.status || 'open'
        )}</select>
      </label>
      <label>Severity
        <select class="saito-form-select" name="severity">${options(
          SEVERITY_LABELS,
          values.severity || 'medium'
        )}</select>
      </label>
      <label>Priority
        <select class="saito-form-select" name="priority">${options(
          PRIORITY_LABELS,
          values.priority || 'normal'
        )}</select>
      </label>
      <label>Assignee public key <span class="saito-help">(optional)</span>
        <input class="saito-input" name="assignee_publickey" autocomplete="off" value="${escapeHtml(
          values.assignee_publickey
        )}" />
      </label>
      ${
        capture
          ? `<label>Explanatory note <span class="saito-help">(optional RedSquare reply)</span>
              <textarea class="saito-textarea" name="note" rows="4"></textarea>
            </label>`
          : ''
      }
      <div class="saito-button-row bugs-editor-actions">
        <button type="button" class="saito-button-secondary bugs-editor-cancel">Cancel</button>
        <button type="submit" class="saito-button-primary"${
          create && !contentAvailable ? ' disabled' : ''
        }>${create ? 'Continue in RedSquare' : 'Save Bug'}</button>
      </div>
    </form>`;
};
