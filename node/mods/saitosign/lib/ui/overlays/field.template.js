function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fieldTemplate(view) {
  const types = [
    ['signature', 'date and signature'],
    ['date', 'date'],
    ['initial', 'initial']
  ]
    .map(([type, label]) => {
      const selected = view.type === type ? ' selected' : '';
      return `<option value="${type}"${selected}>${label}</option>`;
    })
    .join('');

  const chooseNew = Boolean(view.choose_new);
  const signers = view.signers
    .map((signer) => {
      const selected = !chooseNew && signer.index === view.signer_index ? ' selected' : '';
      return `<option value="${signer.index}"${selected}>${escapeHTML(signer.name)}</option>`;
    })
    .join('');

  const remove = view.existing && view.editable
    ? '<button type="button" data-remove-field>Delete</button>'
    : '';
  const primary = view.can_sign ? 'Sign' : 'Confirm';
  const mode = view.can_sign ? 'sign' : 'confirm';
  const disabled = view.editable ? '' : ' disabled';
  const submit = view.editable || view.can_sign
    ? `<button type="submit" class="primary" data-mode="${mode}">${primary}</button>`
    : '';

  return `
    <form class="saitosign-field">
      <label>
        Who
        <select data-field-signer${disabled}>
          <option value="new"${chooseNew ? ' selected' : ''}>Add New Signer</option>
          ${signers}
        </select>
      </label>
      <div class="new-signer"${chooseNew ? '' : ' hidden'}>
        <input data-signer-name type="text" placeholder="name" value="${escapeHTML(view.new_name || '')}" aria-label="Signer name" autocomplete="name" />
        <input data-signer-email type="email" placeholder="email" value="${escapeHTML(view.new_email || '')}" aria-label="Signer email" autocomplete="email" />
      </div>
      <label>
        What
        <select data-field-type${disabled}>${types}</select>
      </label>
      <p class="form-error" data-form-error hidden></p>
      <div class="actions">
        ${remove}
        ${submit}
      </div>
    </form>
  `;
}

module.exports = fieldTemplate;
