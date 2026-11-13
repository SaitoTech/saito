const { escapeHTML } = require('./publish.escape');
const { SHARE_RETENTION_MS } = require('../../share-protocol');

function retentionPhrase(ms) {
  const value = Number(ms);
  const day = 24 * 60 * 60 * 1000;
  if (!Number.isFinite(value) || value <= 0) {
    return 'a short time';
  }
  const days = Math.round(value / day);
  if (days >= 1) {
    return days === 1 ? '1 day' : `${days} days`;
  }
  const hours = Math.max(1, Math.round(value / (60 * 60 * 1000)));
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

function choice(action, title, note, prominent) {
  return `
    <button type="button" class="status-choice stacked${prominent ? ' active' : ''}" data-publish-action="${action}">
      <span>${escapeHTML(title)}</span>
      <span class="choice-note">${escapeHTML(note)}</span>
    </button>
  `;
}

function recipientsHTML(view) {
  const rows = (view.recipients || []).map((recipient) => {
    const email = recipient.email
      ? escapeHTML(recipient.email)
      : 'No email address recorded';
    return `
      <tr>
        <td>
          <span class="share-signer">
            <span class="share-signer-name">${escapeHTML(recipient.name || 'Signer')}</span>
            ${recipient.signed ? '<span class="share-signed">Signed</span>' : ''}
          </span>
        </td>
        <td>${email}</td>
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
    <p class="share-instruction">Please note, SaitoSign will not have a copy of this password. You will need to share it with recipients separately. If this password is lost, we cannot recover your document for you.</p>
  ` : '';
  return `
    <div class="share-people">
      <table class="signing-table share-recipient-table">
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="share-protect">
      <label class="share-protect-toggle">
        <input type="checkbox" data-share-protect ${view.protect ? 'checked' : ''}>
        <span>Encrypt this document with a password</span>
      </label>
      ${password}
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
      title: 'Is this ready to share?',
      subtitle: 'The following addresses will receive an email with a link to access the document. This link will be valid for two days, after which time the server will delete this contract.',
      body: `
        <div class="share-step">
          ${recipientsHTML(view)}
          <p class="share-fallback">You can also <button type="button" class="share-text-link" data-publish-action="share-backup">download a backup</button> and share the file yourself.</p>
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
        <div class="share-link-field">
          <input type="text" readonly value="${escapeHTML(view.link)}" aria-label="Sharing link">
          <button type="button" class="share-copy" data-publish-action="share-copy" aria-label="${view.copied ? 'Copied' : 'Copy link'}">
            <i class="fa-solid ${view.copied ? 'fa-check' : 'fa-copy'}" aria-hidden="true"></i>
          </button>
        </div>
      `
      : '';
    return {
      title: '',
      body: `
        <div class="share-step share-result">
          <div class="share-confirm">
            <i class="fa-solid fa-circle-check share-mark" aria-hidden="true"></i>
            <p class="share-status">Your document is safely uploaded and ready to share.</p>
            <p class="share-instruction">${escapeHTML(sent
              ? 'Invitation emails have been sent to your recipients.'
              : 'SaitoSign could not send the invitation emails. You can still share the document using the link below.')}</p>
            ${link}
            <p class="share-instruction">The server copy will be available for ${escapeHTML(retentionPhrase(SHARE_RETENTION_MS))}, then deleted.</p>
          </div>
          <p class="share-fallback">To keep a permanent copy of your document for manual sharing, <button type="button" class="share-text-link" data-publish-action="share-backup">download a backup</button>.</p>
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
