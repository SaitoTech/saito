function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fieldTemplate(view) {
  const types = ['signature', 'initial', 'date']
    .map((type) => {
      const selected = view.type === type ? ' selected' : '';
      return `<option value="${type}"${selected}>${type}</option>`;
    })
    .join('');

  const signers = view.signers
    .map((signer) => {
      const selected = signer.index === view.signer_index ? ' selected' : '';
      return `<option value="${signer.index}"${selected}>${escapeHTML(signer.name)}</option>`;
    })
    .join('');

  const remove = view.existing
    ? '<button type="button" data-remove-field>Delete Action</button>'
    : '';

  return `
    <form class="saitosign-field">
      <label>
        Who
        <select data-field-signer>
          ${signers}
          <option value="new">Add New Signer</option>
        </select>
      </label>
      <div class="new-signer" hidden>
        <input data-new-signer type="text" placeholder="name or email" aria-label="Signer name" autocomplete="name" />
        <button type="button" data-create-signer>Add</button>
      </div>
      <label>
        What
        <select data-field-type>${types}</select>
      </label>
      <div class="actions">
        ${remove}
        <button type="submit" class="primary">${view.existing ? 'Update' : 'Place'}</button>
      </div>
    </form>
  `;
}

module.exports = fieldTemplate;
