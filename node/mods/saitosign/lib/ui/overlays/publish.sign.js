const { escapeHTML, keyPreviewHTML } = require('./publish.escape');

function signerOptions(state) {
  const options = state.signers
    .map((signer) => {
      const label = signer.email && signer.email !== signer.name
        ? `${signer.name} - ${signer.email}`
        : signer.name || signer.email;
      const selected = signer.index === state.candidateIndex ? ' selected' : '';
      return `<option value="${signer.index}"${selected}>${escapeHTML(label)}</option>`;
    })
    .join('');
  return `
    <option value=""${state.candidateIndex === null ? ' selected' : ''}>Select a signer</option>
    ${options}
    <option value="new">Add New Signer</option>
  `;
}

function signSlide(state) {
  if (state.step === 'identity' || !state.identified || !state.you) {
    return {
      title: 'Tell us who you are',
      body: `
        <div class="sign-step">
          <div class="who" data-you-slot>
            <div class="who-row">
              <select data-you-signer aria-label="Who you are">
                ${signerOptions(state)}
              </select>
              <button type="button" class="saito-button-secondary" data-publish-action="confirm-you">Confirm</button>
            </div>
            <div class="new-signer" data-new-signer hidden>
              <input data-new-signer-name type="text" placeholder="name or email" aria-label="Signer name" autocomplete="name" />
              <button type="button" data-publish-action="add-signer">Add</button>
            </div>
          </div>
        </div>
      `
    };
  }

  const count = Number(state.places) || 0;
  const places = count === 1 ? '1 place' : `${count} places`;
  return {
    title: '',
    body: `
      <div class="sign-step">
        ${keyPreviewHTML(state.you)}
        <p class="sign-requirement">Your signature is still required in ${places}...</p>
        <p>Click the button below to confirm that you have read the document and add your signature as required. You may also <button type="button" class="review-link" data-publish-action="review">review the document</button> and add your signature manually.</p>
      </div>
    `
  };
}

module.exports = signSlide;
