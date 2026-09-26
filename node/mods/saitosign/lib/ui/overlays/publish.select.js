const { escapeHTML, keyPreviewHTML } = require('./publish.escape');

function signerOptions(state) {
  const options = state.signers
    .map((signer) => {
      const label = signer.email && signer.email !== signer.name
        ? `${signer.name} - ${signer.email}`
        : signer.name || signer.email;
      return `<option value="${signer.index}">${escapeHTML(label)}</option>`;
    })
    .join('');
  return `
    <option value="">Select a signer</option>
    ${options}
    <option value="new">Add New Signer</option>
  `;
}

function identityHTML(state) {
  if ((state.signers.length === 1 || state.identified) && state.you) {
    return `
      <div class="who" data-you-slot>
        <p class="heading">You are signing with the following key:</p>
        ${keyPreviewHTML(state.you)}
      </div>
    `;
  }

  return `
    <div class="who" data-you-slot>
      <p class="heading">Please tell us who you are</p>
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
  `;
}

function selectSlide(state) {
  const free = state.plan !== 'premium';
  return {
    title: 'How do you want to share this document?',
    body: `
      <div class="choice">
        <div class="options" role="listbox" aria-label="How to share this document">
          <button type="button" class="option${free ? ' active' : ''}" data-plan="free" aria-selected="${free}">
            <span class="kicker">Free</span>
            <span class="label">Sign and share it yourself</span>
          </button>
          <button type="button" class="option${free ? '' : ' active'}" data-plan="premium" aria-selected="${!free}">
            <span class="kicker">Premium</span>
            <span class="label">Let SaitoSign handle more of it</span>
          </button>
        </div>
        <div class="detail">
          <div class="copy" data-detail="free"${free ? '' : ' hidden'}>
            <p class="heading">No storage or subscription.</p>
            <p>You verify your email, sign, and send the document file to the other signers. The file is the document. It does not need to live on a server.</p>
          </div>
          <div class="copy" data-detail="premium"${free ? ' hidden' : ''}>
            <p class="heading">Hosted storage and a managed signing process.</p>
            <p>SaitoSign can keep the document online, remind signers, and carry more of the workflow. Free signing still works if you would rather pass the file yourself.</p>
          </div>
          ${identityHTML(state)}
        </div>
      </div>
    `
  };
}

module.exports = selectSlide;
