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
          <span class="signer-name">${escapeHTML(row.name)}</span>
          <span class="signer-state">${label}</span>
        </li>
      `;
    })
    .join('');
  return `<ul class="signer-list">${rows}</ul>`;
}

function shareSlide(state) {
  return {
    title: 'This document is ready to share',
    body: `
      <div class="share-step">
        ${peopleHTML(state)}
        <p class="share-instruction">Click the button below to download a completed SaitoSign file. Share this file with the other signers for them to sign and return.</p>
      </div>
    `
  };
}

module.exports = shareSlide;
