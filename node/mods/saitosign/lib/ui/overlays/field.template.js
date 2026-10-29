function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fieldTemplate(view) {
  const chooseNew = Boolean(view.choose_new);
  const signerReady = view.signer_ready !== false;
  const type = String(view.type || '');
  const allowEveryPage = Boolean(view.allow_every_page);
  const showEveryPage = allowEveryPage && (type === 'signature' || type === 'initial');

  const types = [
    ['', 'What should this user do?'],
    ['signature', 'Signature'],
    ['initial', 'Initial'],
    ['date', 'Date / Time']
  ]
    .filter(([value]) => value !== '' || !view.existing)
    .map(([value, label]) => {
      const selected = type === value ? ' selected' : '';
      const disabled = value === '' ? ' disabled' : '';
      return `<option value="${value}"${selected}${disabled}>${label}</option>`;
    })
    .join('');

  const signers = view.signers
    .map((signer) => {
      const selected = !chooseNew && signer.index === view.signer_index ? ' selected' : '';
      return `<option value="${signer.index}"${selected}>${escapeHTML(signer.name)}</option>`;
    })
    .join('');

  const remove = view.existing && view.editable
    ? '<button type="button" data-remove-field aria-label="Delete"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>'
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
          ${signers}
          <option value="new"${chooseNew ? ' selected' : ''}>Add New Signer</option>
        </select>
      </label>
      <div class="new-signer"${chooseNew ? '' : ' hidden'}>
        <input data-signer-name type="text" placeholder="name" value="${escapeHTML(view.new_name || '')}" aria-label="Signer name" autocomplete="name" />
        <input data-signer-email type="email" placeholder="email" value="${escapeHTML(view.new_email || '')}" aria-label="Signer email" autocomplete="email" />
      </div>
      <div class="what"${signerReady ? '' : ' hidden'}>
        <select data-field-type aria-label="What should this user do?"${disabled}>${types}</select>
        <div class="field-details" data-field-details${showEveryPage ? '' : ' hidden'}>
          ${allowEveryPage
            ? `<label class="check">
            <input type="checkbox" data-every-page${view.every_page ? ' checked' : ''}${disabled} />
            <span>add to every page</span>
          </label>`
            : ''}
        </div>
      </div>
      <p class="form-error" data-form-error hidden></p>
      <div class="actions">
        ${remove}
        ${submit}
      </div>
    </form>
  `;
}

module.exports = fieldTemplate;
