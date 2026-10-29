const { escapeHTML } = require('./publish.escape');
const { shareRows } = require('./publish.flow');

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
      const icon = row.signed ? 'fa-check' : 'fa-xmark';
      const label = row.signed ? 'signed' : 'not signed';
      const requirements = (row.requirements || [])
        .map((line) => `<li>${escapeHTML(line)}</li>`)
        .join('');
      const list = requirements
        ? `<ul class="signer-requirements">${requirements}</ul>`
        : '';
      return `
        <li class="signer${row.signed ? ' signed' : ' unsigned'}">
          <div class="signer-heading">
            <i class="fa-solid ${icon} signer-mark" aria-hidden="true"></i>
            <span class="signer-name">${escapeHTML(row.name)}${row.creator ? ' (creator)' : ''} — ${label}</span>
          </div>
          ${list}
        </li>
      `;
    })
    .join('');
  return `<ul class="signer-list">${rows}</ul>`;
}

function finalizeActions() {
  return `
    <p class="share-instruction">This document is ready to be finalized. If these are all the signatures you require, click below and we'll prepare the document for users to sign.</p>
    <div class="status-actions">
      <button type="button" class="saito-button-primary" data-publish-action="finalize">Finalize Documents</button>
    </div>
  `;
}

function signedActions(premium) {
  const instruction = premium
    ? 'All required signatures have been completed. Export this document, or upload it to our server and generate a link, to share the completed copy.'
    : 'All required signatures have been completed. Export this document to share the completed copy.';
  const upload = premium
    ? '<button type="button" class="status-choice" data-publish-action="upload-share">UPLOAD AND SHARE</button>'
    : '';
  const layout = upload ? ' premium' : ' single';
  return `
    <p class="share-instruction">${escapeHTML(instruction)}</p>
    <div class="status-choices${layout}">
      <button type="button" class="status-choice" data-publish-action="share">EXPORT DOCUMENT</button>
      ${upload}
    </div>
  `;
}

function readyActions() {
  return `
    <p class="share-instruction">This document is now ready to be signed. Please select an option below.</p>
    <div class="status-options">
      <div class="status-option">
        <p class="status-option-copy">I need to sign this document myself.</p>
        <button type="button" class="saito-button-primary" data-publish-action="sign-now">Sign</button>
      </div>
      <div class="status-option">
        <p class="status-option-copy">I don't need to sign this document.</p>
        <button type="button" class="saito-button-secondary" data-publish-action="share">Share</button>
      </div>
    </div>
  `;
}

function shareSlide(state) {
  const premium = state.plan === 'premium';
  const status = state.actionStatus;
  const fullySigned = Boolean(status) && status.required > 0 && status.remaining === 0;
  let actions = finalizeActions();
  if (state.finalized) {
    actions = fullySigned ? signedActions(premium) : readyActions();
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
module.exports.requirementLines = requirementLines;
