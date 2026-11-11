const { escapeHTML } = require('./publish.escape');

function choice(action, title, note, prominent) {
  return `
    <button type="button" class="status-choice stacked${prominent ? ' active' : ''}" data-publish-action="${action}">
      <span>${escapeHTML(title)}</span>
      <span class="choice-note">${escapeHTML(note)}</span>
    </button>
  `;
}

function recipientsHTML(view) {
  const rows = (view.recipients || []).map((recipient, index) => {
    const existing = Number.isInteger(recipient.signerIndex);
    const address = existing
      ? `<span class="share-recipient-email">${recipient.email ? escapeHTML(recipient.email) : 'No email address recorded'}</span>`
      : `<input id="saitosign-share-email-${index}" type="email" data-share-email="${index}" value="${escapeHTML(recipient.email)}" autocomplete="off" aria-label="Additional recipient email">`;
    return `
      <tr>
        <td>${address}</td>
        <td class="share-trash-cell">
          <button type="button" class="share-trash" data-publish-action="share-remove" data-share-index="${index}" aria-label="Remove recipient">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  const password = view.protect ? `
    <div class="verify-field">
      <label for="saitosign-share-password">Password</label>
      <input id="saitosign-share-password" type="password" data-share-password value="${escapeHTML(view.password || '')}" autocomplete="new-password">
    </div>
    <div class="verify-field">
      <label for="saitosign-share-password-confirm">Confirm password</label>
      <input id="saitosign-share-password-confirm" type="password" data-share-password-confirm value="${escapeHTML(view.confirm || '')}" autocomplete="new-password">
    </div>
  ` : '';
  return `
    <div class="share-people">
      <h4>Recipients</h4>
      <table class="signing-table share-recipient-table">
        <tbody>${rows}</tbody>
      </table>
      <button type="button" class="share-add" data-publish-action="share-add">Add a recipient</button>
    </div>
    <div class="share-protect">
      <label class="share-protect-toggle">
        <input type="checkbox" data-share-protect ${view.protect ? 'checked' : ''}>
        <span>Protect this document with a password</span>
      </label>
      ${password}
      <p class="share-instruction">Please note, SaitoSign will not have a copy of this password. You will need to share it with recipients separately. If the password is lost, we cannot recover the document for you.</p>
    </div>
  `;
}

function shareFlowSlide(state) {
  const view = state.shareView || {};
  const error = view.error ? `<p class="note fail">${escapeHTML(view.error)}</p>` : '';
  const step = state.step;
  if (step === 'share-manual') {
    return {
      title: 'Export and share manually',
      subtitle: 'Exporting is the safest way to share your document. You retain complete control over your files, and your document is never uploaded to our servers. Saito has no access to its contents.',
      body: `
        <div class="share-step">
          <p class="share-instruction">Export your document as a ZIP file and send it to anyone who needs to sign or access it.</p>
          ${error}
        </div>
      `
    };
  }
  if (step === 'share-exported') {
    return {
      title: 'Document exported successfully.',
      subtitle: 'Your ZIP file is ready to share. Send this file to the people who need to sign or access your document.',
      body: `
        <div class="share-step">
          <p class="share-instruction">Your browser downloaded ${escapeHTML(view.filename)}. Look in your downloads folder.</p>
          <p class="share-instruction">After someone signs it, they need to export a new ZIP and send that file onward. SaitoSign does not deliver the updated file for you.</p>
        </div>
      `
    };
  }
  if (step === 'share-privacy') {
    return {
      title: 'How should SaitoSign store this document?',
      body: `
        <div class="share-step">
          <div class="status-choices">
            ${choice('share-standard', 'Standard sharing', 'Your document is uploaded to SaitoSign and stored temporarily so we can distribute it to the people you invite.', true)}
            ${choice('share-encrypted', 'Encrypted sharing', 'Your document is encrypted on your device before being uploaded. SaitoSign stores and distributes the encrypted file but cannot read its contents.', false)}
          </div>
          ${error}
        </div>
      `
    };
  }
  if (step === 'share-password') {
    return {
      title: 'Create the document password',
      subtitle: 'This password is needed by everyone who wants to open or sign the document.',
      body: `
        <div class="share-step">
          <p class="share-instruction">SaitoSign does not receive or store your password. Share it with recipients separately from the document link. If the password is lost, SaitoSign cannot recover the document.</p>
          <div class="verify-form">
            <div class="verify-field">
              <label for="saitosign-share-password">Password</label>
              <input id="saitosign-share-password" type="password" data-share-password value="${escapeHTML(view.password || '')}" autocomplete="new-password">
            </div>
            <div class="verify-field">
              <label for="saitosign-share-password-confirm">Confirm password</label>
              <input id="saitosign-share-password-confirm" type="password" data-share-password-confirm value="${escapeHTML(view.confirm || '')}" autocomplete="new-password">
            </div>
          </div>
          ${error}
        </div>
      `
    };
  }
  if (step === 'share-recipients') {
    return {
      title: 'Who needs to sign?',
      subtitle: 'These people will receive an email with a link to access the document. Anyone already listed as a signer will retain their existing signature requirements. Additional recipients will be given access to the document but will not be asked to sign.',
      body: `
        <div class="share-step">
          <p class="share-instruction">SaitoSign will keep a temporary server copy for about two days, then delete it. This is not permanent storage.</p>
          ${recipientsHTML(view)}
          ${error}
        </div>
      `
    };
  }
  if (step === 'share-progress') {
    const working = view.outcome !== 'failed';
    return {
      title: 'Sharing your document',
      body: `
        <div class="share-step share-progress">
          ${working ? '<div class="share-spinner" role="status" aria-label="Working"></div>' : ''}
          ${working ? `<p class="share-status">${escapeHTML(view.detail || 'Preparing your document...')}</p><p class="share-elapsed"></p>` : ''}
          ${error}
          ${view.outcome === 'failed' ? '<button type="button" class="share-add" data-publish-action="share-retry-upload">Retry</button>' : ''}
        </div>
      `
    };
  }
  if (step === 'share-sent') {
    const sent = view.outcome === 'success';
    const link = view.link
      ? `
        <p class="share-instruction">${sent ? 'You can also give people access by sharing this link yourself.' : 'You can still give recipients access by sharing the link below.'}</p>
        <div class="share-link-row">
          <input type="text" readonly value="${escapeHTML(view.link)}" aria-label="Sharing link">
          <button type="button" class="share-add" data-publish-action="share-copy">${view.copied ? 'Copied' : 'Copy Link'}</button>
        </div>
      `
      : '';
    return {
      title: sent ? 'Success' : 'Document stored',
      body: `
        <div class="share-step share-result">
          <i class="fa-solid fa-circle-check share-mark" aria-hidden="true"></i>
          <p class="share-status">${escapeHTML(sent
            ? 'Your document has been stored and invitation emails have been sent.'
            : 'Your document is safely stored on the sharing server, but SaitoSign could not send the invitation emails.')}</p>
          ${error}
          ${link}
          <p class="share-instruction">${sent
            ? 'The server copy will be available for about two days, then deleted. If you expect people will need longer to access the document, download a backup and keep it somewhere safe.'
            : 'The server copy will be available for about two days, then deleted.'}</p>
          ${sent
            ? '<button type="button" class="share-add" data-publish-action="share-backup">Backup document</button>'
            : '<button type="button" class="share-add" data-publish-action="share-retry-email">Retry emails</button>'}
        </div>
      `
    };
  }
  if (step === 'share-unlock') {
    return {
      title: 'This document is password protected',
      subtitle: 'The document has been encrypted by the person who shared it with you. Enter the password they provided to decrypt and view the document.',
      body: `
        <div class="share-step">
          <div class="verify-field">
            <label for="saitosign-share-unlock">Password</label>
            <input id="saitosign-share-unlock" type="password" data-share-password value="${escapeHTML(view.password || '')}" autocomplete="current-password">
          </div>
          ${error}
        </div>
      `
    };
  }
  if (step === 'share-retry') {
    return {
      title: view.heading || 'Signature saved locally — upload required',
      subtitle: view.detail || '',
      body: `
        <div class="share-step">
          ${view.needsPassword ? `
            <div class="verify-field">
              <label for="saitosign-share-retry-password">Password</label>
              <input id="saitosign-share-retry-password" type="password" data-share-password value="${escapeHTML(view.password || '')}" autocomplete="current-password">
            </div>
          ` : ''}
          ${error}
        </div>
      `
    };
  }
  return {
    title: 'How do you want to share this with others?',
    body: `
      <div class="share-step">
        <div class="status-choices">
          ${choice('share-manual', 'I want to export a file for manual distribution.', 'Export a ZIP file and send it yourself. The document is not uploaded.', false)}
          ${choice('share-assisted', 'I want the server to email links.', 'Upload the document and email a link to each recipient.', true)}
        </div>
        ${error}
      </div>
    `
  };
}

module.exports = shareFlowSlide;
