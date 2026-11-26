const PROGRESS_MINIMUM_MS = 3000;

function progressHold(startedAt, now = Date.now()) {
  const started = Number(startedAt);
  if (!Number.isFinite(started) || started <= 0) {
    return 0;
  }
  return Math.max(0, PROGRESS_MINIMUM_MS - (now - started));
}

function holdProgress(startedAt, now = Date.now()) {
  const wait = progressHold(startedAt, now);
  if (!wait) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, wait));
}

const { escapeHTML } = require('./publish.escape');
const { shareRows } = require('./publish.flow');
const { SHARE_RETENTION_MS } = require('../../share-protocol');

function pagesCoverAll(pages, pageCount) {
  const count = Number(pageCount) || 0;
  if (count < 1 || pages.length !== count) {
    return false;
  }
  for (let page = 1; page <= count; page += 1) {
    if (!pages.includes(page)) {
      return false;
    }
  }
  return true;
}

function requirementLines(actions, userIndex, pageCount) {
  const mine = (actions || []).filter((action) =>
    Number(action.user) === userIndex
    && (action.type === 'signature' || action.type === 'initial')
  );
  const pagesByType = { initial: new Set(), signature: new Set() };
  const seenGroups = { initial: new Set(), signature: new Set() };

  mine.forEach((action) => {
    const type = action.type;
    const page = Number(action.page);
    if (!Number.isInteger(page) || page < 1) {
      return;
    }
    const group = String(action.group || '').trim();
    if (group) {
      if (seenGroups[type].has(group)) {
        return;
      }
      seenGroups[type].add(group);
      mine.forEach((item) => {
        if (item.type !== type || String(item.group || '').trim() !== group) {
          return;
        }
        const groupedPage = Number(item.page);
        if (Number.isInteger(groupedPage) && groupedPage > 0) {
          pagesByType[type].add(groupedPage);
        }
      });
      return;
    }
    pagesByType[type].add(page);
  });

  const lines = [];
  ['initial', 'signature'].forEach((type) => {
    const pages = Array.from(pagesByType[type]).sort((left, right) => left - right);
    if (!pages.length) {
      return;
    }
    const kind = type === 'initial' ? 'Initials' : 'Signature';
    const where = pagesCoverAll(pages, pageCount)
      ? 'all pages'
      : `pages ${pages.join(', ')}`;
    lines.push(`${kind} required: ${where}`);
  });
  return lines;
}

function peopleHTML(state) {
  const rows = shareRows(state)
    .map((row) => {
      const requirements = (row.requirements || [])
        .map((line) => escapeHTML(line))
        .join('<br>');
      const status = row.signed ? 'Signed' : 'Not signed';
      const email = row.email ? escapeHTML(row.email) : 'Not provided';
      return `
        <tr class="signer-row" data-signer-audit="${escapeHTML(row.index)}" tabindex="0" role="button" aria-label="View verification details for ${escapeHTML(row.name)}">
          <td>${escapeHTML(row.name)}${row.creator ? ' (creator)' : ''}</td>
          <td>${email}</td>
          <td>${requirements}</td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <table class="signing-table">
      <thead>
        <tr>
          <th>Signer</th>
          <th>Email Address</th>
          <th>Requirement</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function decideChoices() {
  return `
    <div class="status-choices">
      <button type="button" class="status-choice stacked" data-publish-action="sign-yes">
        <span>Yes</span>
        <span class="choice-note">I need to sign this document.</span>
      </button>
      <button type="button" class="status-choice stacked" data-publish-action="sign-no">
        <span>No</span>
        <span class="choice-note">I need to share this with others.</span>
      </button>
    </div>
  `;
}

function signedActions() {
  return `
    <p class="share-instruction">All required signatures have been completed. Share the completed document with the people who need it.</p>
    <p class="share-fallback"><button type="button" class="share-text-link" data-publish-action="download-completed">Download completed document</button></p>
  `;
}

function distributeActions() {
  return `
    <p class="share-instruction">Share this document. SaitoSign will email each recipient a link to open it.</p>
    <div class="status-choices single">
      <button type="button" class="status-choice" data-publish-action="share">I need to share this document</button>
    </div>
  `;
}

function readyActions() {
  return `
    <p class="share-instruction">This document is now ready to be signed.</p>
    <div class="status-choices">
      <button type="button" class="status-choice" data-publish-action="sign-now">I need to sign this document</button>
      <button type="button" class="status-choice" data-publish-action="skip-sign">I need to share this document</button>
    </div>
  `;
}

function readySlide(state) {
  return {
    title: 'Digital Signatures Required:',
    body: `
      <div class="share-step">
        ${peopleHTML(state)}
        <p class="share-instruction">Continue sends an invitation to each email address above. Each link is valid for ${retentionDays(SHARE_RETENTION_MS)}. After that, the server deletes the document and its associated information. If you wish to sign the document in advance, you can <button type="button" class="share-text-link" data-publish-action="ready-sign">click here</button> to verify your identity and sign before sharing.</p>
      </div>
    `
  };
}

function decideSlide() {
  return {
    title: 'Do you need to sign this document?',
    body: `
      <div class="share-step">
        ${decideChoices()}
      </div>
    `
  };
}

function signatureCompleteSlide(state) {
  const manual = state.step === 'signature-export';
  const busy = state.uploadBusy === true;
  const uploaded = state.uploaded === true;
  if (manual) {
    let instruction = 'This is the state of the document. You imported this file yourself, so SaitoSign cannot upload it or email the other signers. Export the signed document and send that new file back yourself.';
    let action = 'export-signed';
    let actionLabel = 'Export the signed document';
    let working = 'Exporting the signed document.';
    if (uploaded) {
      instruction = state.uploadNote || 'The signed document has been exported. Send that file to the other signers. SaitoSign does not deliver it for you.';
    }
    const link = uploaded || busy
      ? ''
      : `<p class="share-fallback"><button type="button" class="share-text-link" data-publish-action="${action}">${escapeHTML(actionLabel)}</button></p>`;
    const problem = !uploaded && !busy && state.uploadNote
      ? `<p class="note fail">${escapeHTML(state.uploadNote)}</p>`
      : '';
    return {
      title: 'Document Status',
      body: `
      <div class="share-step">
        ${peopleHTML(state)}
        <p class="share-instruction">${escapeHTML(instruction)}</p>
        ${busy ? `<p class="share-status">${escapeHTML(working)}</p>` : link}
        ${problem}
      </div>
    `
    };
  }

  if (!uploaded) {
    return {
      title: '',
      body: `
      <div class="share-step">
        <div class="share-spinner" role="status" aria-label="Uploading"></div>
        <p class="share-status">Uploading your signatures.</p>
      </div>
    `
    };
  }

  return {
    title: 'Document Signed',
    body: `
      <div class="share-step">
        ${peopleHTML(state)}
        <p class="share-instruction">You have provided all of the signatures necessary. You will be notified by email once all parties have completed signing the document. In the meantime, you may click on any entry in the table above to see the state of the document and inspect the cryptographic signatures and attestations.</p>
      </div>
    `
  };
}

const UPLOAD_PROGRESS = {
  upload: {
    heading: 'Uploading your signatures',
    detail: 'Securely uploading your signed document and verification information.'
  },
  confirm: {
    heading: 'Confirming your submission',
    detail: 'Checking that your signed document has been successfully received.'
  }
};

const EMAIL_DELIVERY_NOTICE = 'SaitoSign could not send the notification emails. Your document was uploaded successfully. You can still access its status and share it using the available link.';

function signatureUploadSlide(state) {
  if (state.uploadError) {
    return {
      title: 'Upload not confirmed',
      subtitle: 'The signed document has not yet been confirmed as uploaded.',
      body: `
        <div class="share-step share-result">
          <div class="share-confirm">
            <p class="share-status">Upload not confirmed</p>
            <p class="share-instruction">The signed document has not yet been confirmed as uploaded.</p>
            <p class="share-instruction">${escapeHTML(state.uploadError)}</p>
            <div class="share-backup">
              <button type="button" class="share-backup-button" data-publish-action="retry-signature-upload">Try again</button>
              <button type="button" class="share-text-link" data-publish-action="close">Return to the document</button>
            </div>
          </div>
        </div>
      `
    };
  }
  const stage = UPLOAD_PROGRESS[state.uploadStage] || UPLOAD_PROGRESS.upload;
  return {
    title: stage.heading,
    subtitle: stage.detail,
    body: `
      <div class="share-step share-result">
        <div class="share-confirm">
          <div class="share-spinner" role="status" aria-label="${escapeHTML(stage.heading)}"></div>
          <div class="share-progress-copy">
            <p class="share-status">${escapeHTML(stage.heading)}</p>
            <p class="share-instruction">${escapeHTML(stage.detail)}</p>
          </div>
        </div>
      </div>
    `
  };
}

function signatureUploadedSlide(state) {
  const link = String(state.shareLink || '').trim();
  const linkField = link
    ? `
      <label class="share-link-field">
        <input type="text" readonly value="${escapeHTML(link)}" aria-label="Share link">
        <button type="button" class="saito-button-secondary" data-publish-action="copy-uploaded-link">${state.linkCopied ? 'Copied' : 'Copy'}</button>
      </label>
    `
    : '';
  const email = state.emailNotice
    ? `<p class="share-fallback">${escapeHTML(state.emailNotice)}</p>`
    : '';
  return {
    title: '',
    body: `
      <div class="share-step share-result">
        <div class="share-confirm">
          <i class="fa-solid fa-circle-check share-mark" aria-hidden="true"></i>
          <p class="share-status">Document Successfully Signed and Uploaded</p>
          <p class="share-instruction">You have successfully uploaded your signatures and verification information. You will receive an email notification once all parties have completed signing the document.</p>
          <p class="share-instruction">You can return to the document status page at any time to inspect the signing progress and review the cryptographic signatures and attestations.</p>
          ${email}
          ${linkField}
          <button type="button" class="share-backup-button" data-publish-action="view-document-status">View Document Status</button>
        </div>
      </div>
    `
  };
}

function signatureUploadOutcome(result) {
  if (result?.ok === true && result.skipped !== true) {
    return {
      accepted: true,
      complete: result.complete === true,
      alreadyPresent: result.already_present === true,
      notificationAttempted: result.notification_attempted === true,
      notificationFailed: result.notification_failed === true
    };
  }
  return { accepted: false, message: signatureUploadError(result) };
}

function signatureUploadError(result) {
  if (result?.skipped) {
    return 'This document is not connected to a shared copy, so the signatures cannot be uploaded. Your signatures are still saved on this device.';
  }
  const raw = String(result?.error || '').trim();
  const preserved = 'Your signatures are still saved on this device.';
  if (!raw || raw.startsWith('This upload was not signed') || raw === 'This upload could not be signed.') {
    return `The signatures could not be uploaded. ${preserved} Try again.`;
  }
  if (raw.includes(preserved)) {
    return raw;
  }
  return `${raw} ${preserved}`;
}

function shareSlide(state) {
  const status = state.actionStatus;
  const fullySigned = Boolean(status) && status.required > 0 && status.remaining === 0;
  let actions = signedActions();
  if (!fullySigned && !state.distributeOnly) {
    actions = readyActions();
  } else if (!fullySigned) {
    actions = distributeActions();
  }
  return {
    title: 'Document Status',
    body: `
      <div class="share-step">
        ${peopleHTML(state)}
        ${actions}
      </div>
    `
  };
}

module.exports = shareSlide;
module.exports.readySlide = readySlide;
module.exports.decideSlide = decideSlide;
module.exports.signatureCompleteSlide = signatureCompleteSlide;
module.exports.signatureUploadSlide = signatureUploadSlide;
module.exports.signatureUploadedSlide = signatureUploadedSlide;
module.exports.signatureUploadOutcome = signatureUploadOutcome;
module.exports.progressHold = progressHold;
module.exports.holdProgress = holdProgress;
module.exports.PROGRESS_MINIMUM_MS = PROGRESS_MINIMUM_MS;
module.exports.EMAIL_DELIVERY_NOTICE = EMAIL_DELIVERY_NOTICE;
module.exports.requirementLines = requirementLines;

function retentionDays(ms) {
  const days = Math.round(Number(ms) / (24 * 60 * 60 * 1000));
  if (days === 1) {
    return '1 day';
  }
  return `${Math.max(days, 1)} days`;
}

const INSPECTABLE_SIGNER_STEPS = new Set(['ready', 'share', 'signature-complete', 'signature-export']);

function inspectableSignerStep(step) {
  return INSPECTABLE_SIGNER_STEPS.has(step);
}

module.exports.inspectableSignerStep = inspectableSignerStep;
