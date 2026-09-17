const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]
  );

module.exports = ({ admins, permissions, publicKey, busy, error, notice, draft }) => `
  <div class="admin-administrators-page" aria-busy="${busy}">
    <div class="admin-administrators-header">
      <h1>Administrators</h1>
      <button type="button" class="admin-button" id="admin-administrators-refresh" ${busy ? 'disabled' : ''}>Refresh</button>
    </div>
    <p>All administrators can manage this server and add or remove other administrators.
      The first listed administrator is primary and cannot be removed. Only the primary
      administrator can transfer primary status.</p>
    <div role="alert" class="admin-administrators-error">${escapeHtml(error)}</div>
    <div role="status" class="admin-administrators-notice">${escapeHtml(notice)}</div>
    ${
      admins === null
        ? '<p>Waiting for the server to load administrators.</p>'
        : `
      <ol class="admin-administrators-list">
        ${admins
          .map(
            (key, index) => `
          <li>
            <div class="admin-administrator-identity">
              <span class="admin-administrator-key">${escapeHtml(key)}</span>
              <span class="admin-administrator-labels">
                ${index === 0 ? '<span class="admin-administrator-badge">Primary admin</span>' : ''}
                ${key === publicKey ? '<span class="admin-administrator-badge">You</span>' : ''}
              </span>
            </div>
            <div class="admin-administrator-actions">
              ${index > 0 && permissions?.can_promote ? `<button type="button" class="admin-button-quiet" data-admin-action="promote-admin" data-key="${escapeHtml(key)}" ${busy ? 'disabled' : ''}>Make primary</button>` : ''}
              ${index > 0 && permissions?.can_remove ? `<button type="button" class="admin-button-quiet" data-admin-action="remove-admin" data-key="${escapeHtml(key)}" ${busy ? 'disabled' : ''}>Remove</button>` : ''}
            </div>
          </li>`
          )
          .join('')}
      </ol>`
    }
    ${
      permissions?.can_add
        ? `
      <form id="admin-administrator-add-form">
        <label for="admin-administrator-key">New administrator’s Saito public key</label>
        <div class="admin-administrators-add">
          <input type="text" class="admin-input" id="admin-administrator-key" value="${escapeHtml(draft)}" autocomplete="off" spellcheck="false" required ${busy ? 'disabled' : ''} />
          <button type="submit" class="admin-button" ${busy ? 'disabled' : ''}>Add administrator</button>
        </div>
      </form>`
        : ''
    }
  </div>`;
