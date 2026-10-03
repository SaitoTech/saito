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

  const chooseNew = Boolean(view.choose_new);
  const signers = view.signers
    .map((signer) => {
      const selected = !chooseNew && signer.index === view.signer_index ? ' selected' : '';
      return `<option value="${signer.index}"${selected}>${escapeHTML(signer.name)}</option>`;
    })
    .join('');

  const remove = view.existing
    ? '<button type="button" data-remove-field>Delete Action</button>'
    : '';
  const primary = !view.existing ? 'Place' : view.can_sign ? 'Sign' : 'Update';
  const mode = !view.existing ? 'place' : view.can_sign ? 'sign' : 'update';
  const addSigner = view.defer_signer
    ? ''
    : '<button type="button" data-create-signer>Add</button>';

  return `
    <form class="saitosign-field">
      <label>
        Who
        <select data-field-signer>
          ${signers}
          <option value="new"${chooseNew ? ' selected' : ''}>Add New Signer</option>
        </select>
      </label>
      <div class="new-signer"${chooseNew ? '' : ' hidden'}>
        <input data-new-signer type="text" placeholder="name or email" value="${escapeHTML(view.new_name || '')}" aria-label="Signer name" autocomplete="name" />
        ${addSigner}
      </div>
      <label>
        What
        <select data-field-type>${types}</select>
      </label>
      <div class="actions">
        ${remove}
        <button type="submit" class="primary" data-mode="${mode}">${primary}</button>
      </div>
    </form>
  `;
}

module.exports = fieldTemplate;
