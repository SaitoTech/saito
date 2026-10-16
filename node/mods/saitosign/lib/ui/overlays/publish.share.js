const { escapeHTML } = require('./publish.escape');
const { shareRows } = require('./publish.flow');

function peopleHTML(state) {
  const rows = shareRows(state)
    .map((row) => {
      const icon = row.signed ? 'fa-check' : 'fa-xmark';
      const label = row.signed ? 'signed' : 'not signed';
      return `
        <li class="signer${row.signed ? ' signed' : ' unsigned'}">
          <i class="fa-solid ${icon} signer-mark" aria-hidden="true"></i>
          <span class="signer-name">${escapeHTML(row.name)}${row.creator ? ' (creator)' : ''}</span>
          <span class="signer-state">${label}</span>
        </li>
      `;
    })
    .join('');
  return `<ul class="signer-list">${rows}</ul>`;
}

function shareSlide(state) {
  const premium = state.plan === 'premium';
  const status = state.actionStatus;
  const fullySigned = Boolean(status) && status.required > 0 && status.remaining === 0;
  const instruction = fullySigned
    ? (premium
      ? 'All required signatures have been completed. Export this document, or upload it to our server and generate a link, to share the completed copy.'
      : 'All required signatures have been completed. Export this document to share the completed copy.')
    : (premium
      ? 'This document is ready to be signed. Please add your signature now as required. Once you have finished, come back here to export this document or upload it to our server and generate a link for sharing with any other parties who need to sign.'
      : 'This document is ready to be signed. Please add your signature now as required. Once you have finished, come back here to export this document and share it with any other parties who need to sign.');
  const sign = fullySigned
    ? ''
    : '<button type="button" class="status-choice" data-publish-action="sign-now">SIGN DOCUMENT</button>';
  const upload = premium
    ? '<button type="button" class="status-choice" data-publish-action="upload-share">UPLOAD AND SHARE</button>'
    : '';
  const count = Number(Boolean(sign)) + 1 + Number(Boolean(upload));
  const layout = count === 1 ? ' single' : count === 3 ? ' premium' : '';
  return {
    title: 'Document Status',
    body: `
      <div class="share-step">
        ${peopleHTML(state)}
        <p class="share-instruction">${escapeHTML(instruction)}</p>
        <div class="status-choices${layout}">
          ${sign}
          <button type="button" class="status-choice" data-publish-action="share">EXPORT DOCUMENT</button>
          ${upload}
        </div>
      </div>
    `
  };
}

module.exports = shareSlide;
