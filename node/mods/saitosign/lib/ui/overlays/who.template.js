const { escapeHTML } = require('./publish.escape');

function whoTemplate(signers) {
  const rows = (signers || [])
    .map((signer) => {
      const name = signer.name || signer.email || 'Signer';
      const email = signer.email || '';
      return `
        <button type="button" class="who-signer" data-who-signer="${Number(signer.index)}">
          <span class="who-signer-name">${escapeHTML(name)}</span>
          <span class="who-signer-email">${escapeHTML(email)}</span>
        </button>
      `;
    })
    .join('');
  return `
    <div class="saitosign-who">
      <p class="title">Who are you?</p>
      <div class="who-list" role="list">
        ${rows}
      </div>
    </div>
  `;
}

module.exports = whoTemplate;
