const { escapeHTML } = require('./publish.escape');
const { shareRows } = require('./publish.flow');

function peopleHTML(state) {
  const rows = shareRows(state)
    .map((row) => {
      const icon = row.done ? 'fa-check' : 'fa-xmark';
      const lines = row.lines
        .map((line) => `<li>${escapeHTML(line)}</li>`)
        .join('');
      const status = row.detail
        ? ` <span class="status">${escapeHTML(row.detail)}</span>`
        : '';
      return `
        <li class="person${row.done ? ' done' : ' waiting'}">
          <i class="fa-solid ${icon} mark" aria-hidden="true"></i>
          <div class="person-copy">
            <p class="person-line"><span class="who">${escapeHTML(row.name)}</span>${status}</p>
            ${lines ? `<ul class="lines">${lines}</ul>` : ''}
          </div>
        </li>
      `;
    })
    .join('');
  return `<ul class="people">${rows}</ul>`;
}

function shareSlide(state) {
  return {
    title: 'This document is ready to share',
    body: `
      <div class="share-step">
        <p>You need to send this document to the other signers.</p>
        ${peopleHTML(state)}
        <p class="share-instruction">Click the button below to download a completed SaitoSign file. Share this file with the other signers for them to sign and return.</p>
      </div>
    `
  };
}

module.exports = shareSlide;
