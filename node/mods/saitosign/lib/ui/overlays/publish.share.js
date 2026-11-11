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

function readyChoices() {
  return `
    <div class="status-choices">
      <button type="button" class="status-choice stacked" data-publish-action="ready-no">
        <span>No</span>
        <span class="choice-note">I need to add more signatures.</span>
      </button>
      <button type="button" class="status-choice stacked" data-publish-action="ready-yes">
        <span>Yes</span>
        <span class="choice-note">I'm ready to sign or share.</span>
      </button>
    </div>
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
    <div class="status-choices single">
      <button type="button" class="status-choice" data-publish-action="share">I need to share this document</button>
    </div>
  `;
}

function distributeActions() {
  return `
    <p class="share-instruction">Share this document. If you export a ZIP, send the new file yourself after anyone else signs it. SaitoSign does not track who receives a manual export.</p>
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
    title: 'Is this document ready to sign?',
    body: `
      <div class="share-step">
        ${peopleHTML(state)}
        ${readyChoices()}
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
module.exports.requirementLines = requirementLines;
