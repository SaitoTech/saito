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
      const requirements = (row.requirements || [])
        .map((line) => escapeHTML(line))
        .join('<br>');
      const status = row.signed ? 'Signed' : 'Not signed';
      return `
        <tr class="signer-row" data-signer-audit="${escapeHTML(row.index)}" tabindex="0" role="button" aria-label="View verification details for ${escapeHTML(row.name)}">
          <td>${escapeHTML(row.name)}${row.creator ? ' (creator)' : ''}</td>
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

function finalizeActions() {
  return `
    <p class="share-instruction">Click below to prepare the document for users to sign.</p>
    <div class="status-actions">
      <button type="button" class="saito-button-primary" data-publish-action="finalize">Continue</button>
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

function distributeActions(premium) {
  const upload = premium
    ? '<button type="button" class="status-choice" data-publish-action="upload-share">UPLOAD AND SHARE</button>'
    : '';
  const layout = upload ? ' premium' : ' single';
  return `
    <p class="share-instruction">Click below to export this document, distribute it to the signers.</p>
    <div class="status-choices${layout}">
      <button type="button" class="status-choice" data-publish-action="share">EXPORT DOCUMENT</button>
      ${upload}
    </div>
  `;
}

function readyActions() {
  return `
    <p class="share-instruction">This document is now ready to be signed.</p>
    <div class="status-choices">
      <button type="button" class="status-choice" data-publish-action="sign-now">I'm signing this document.</button>
      <button type="button" class="status-choice" data-publish-action="skip-sign">I'm preparing this document for someone else.</button>
    </div>
  `;
}

function shareSlide(state) {
  const premium = state.plan === 'premium';
  const status = state.actionStatus;
  const fullySigned = Boolean(status) && status.required > 0 && status.remaining === 0;
  let actions = finalizeActions();
  if (state.finalized) {
    if (fullySigned) {
      actions = signedActions(premium);
    } else if (state.distributeOnly) {
      actions = distributeActions(premium);
    } else {
      actions = readyActions();
    }
  }
  const confirming = !state.finalized;
  return {
    title: confirming ? 'Ready to Sign Document?' : 'Document Status',
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
