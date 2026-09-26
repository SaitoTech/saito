function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function signerTemplate(view) {
  const verified = view.verified ? ' checked' : '';
  const signed = view.signed ? ' checked' : '';

  return `
    <section class="saitosign-user">
      <div class="facts">
        <label class="fact">
          name:
          <input data-user-name type="text" value="${escapeHTML(view.name || '')}" autocomplete="name" />
        </label>
        <label class="fact">
          email:
          <input data-user-email type="text" value="${escapeHTML(view.email || '')}" autocomplete="email" />
        </label>
        <div class="fact">
          <span>public key:</span>
          <p>${escapeHTML(view.publickey || '')}</p>
        </div>
      </div>
      <label class="status">
        <input type="checkbox" disabled${verified}>
        has verified
      </label>
      <label class="status">
        <input type="checkbox" disabled${signed}>
        signed verified
      </label>
      <div class="actions">
        <button type="button" data-remove-signer-confirm>delete user</button>
        <button type="button" class="primary" data-update-user>Update</button>
      </div>
    </section>
  `;
}

module.exports = signerTemplate;
