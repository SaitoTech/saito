const methodsTemplate = require('./publish.methods');
const { escapeHTML } = require('./publish.escape');
const passportTemplate = require('./passport.template');

function emailAddress(state) {
  return state.you && state.you.email ? state.you.email : '';
}

function emailPanel(state) {
  const email = state.verificationMethods.find((method) => method.id === 'email');
  if (email && email.status === 'verified') {
    return `<p class="heading">Your email has been verified.</p>`;
  }

  const error = state.verifyError ? `<p class="note fail">${escapeHTML(state.verifyError)}</p>` : '';
  if (state.checking || (email && email.status === 'sent')) {
    const button = state.checking
      ? `<button type="button" class="verify-action" disabled aria-label="Checking"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></button>`
      : `<button type="button" class="verify-action" data-publish-action="submit-signature">Confirm</button>`;
    const dev = state.devCode
      ? `<p class="dev-code">DEV MODE - Verification Code: <code>${escapeHTML(state.devCode)}</code></p>`
      : '';
    return `
      <p>Paste the cryptographic code from the email you receive into the box below.</p>
      ${dev}
      <div class="send-row">
        <input data-verify-signature type="text" value="${escapeHTML(state.pendingCode || '')}" aria-label="Cryptographic code" autocomplete="off"${state.checking ? ' disabled' : ''} />
        ${button}
      </div>
      ${error}
    `;
  }

  return `
    <p class="heading">We need to verify your email address.</p>
    <div class="send-row">
      <input data-verify-email type="email" value="${escapeHTML(emailAddress(state))}" aria-label="Email address" autocomplete="email" />
      <button type="button" class="verify-action" data-publish-action="send-email">Send Email</button>
    </div>
    ${error}
  `;
}

function photoPanel(state) {
  const photo = state.verificationMethods.find((method) => method.id === 'photo');
  if (photo && photo.status === 'verified') {
    const src = photoSource(photo.photo);
    const image = src
      ? `<img class="verified-photo" src="${escapeHTML(src)}" alt="Verification photograph">`
      : '';
    return `
      <p class="heading">Your photo has been verified.</p>
      ${image}
    `;
  }

  const method = photo || { description: '' };
  return `
    <p class="heading">Take a photo.</p>
    <p>${escapeHTML(method.description)}</p>
    <div class="send-row">
      <button type="button" class="verify-action" data-publish-action="take-photo">Take Photo</button>
    </div>
  `;
}

function passportPanel(state) {
  const method = state.verificationMethods.find((item) => item.id === 'passport');
  return `
    <p class="heading">Upload your passport identity page.</p>
    <p>${escapeHTML(method?.description || '')}</p>
    ${passportTemplate(method?.image || '', state.passportError || '')}
  `;
}

function photoSource(value) {
  const src = String(value || '').trim();
  return src.startsWith('data:image/') ? src : '';
}

function verifySlide(state) {
  const upsell = state.verificationMethods.find((method) => method.id === state.upsell);
  const focus = state.focus || 'email';
  const method = state.verificationMethods.find((item) => item.id === focus);
  const panel = upsell
    ? `<p class="heading">${escapeHTML(upsell.description)}</p>`
    : focus === 'photo'
      ? photoPanel(state)
      : focus === 'passport'
        ? passportPanel(state)
        : focus === 'email'
          ? emailPanel(state)
          : `<p class="heading">${escapeHTML(method?.description || 'This verification method is not available.')}</p>`;

  return {
    title: 'Verify Identity',
    body: `
      <div class="verify-flow">
        ${methodsTemplate(state.verificationMethods, state.upsell || focus)}
        <div class="detail">
          ${panel}
        </div>
      </div>
    `
  };
}

module.exports = verifySlide;
