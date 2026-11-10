const methodsTemplate = require('./publish.methods');
const { escapeHTML } = require('./publish.escape');
const passportTemplate = require('./passport.template');

function emailAddress(state) {
  return state.you && state.you.email ? state.you.email : '';
}

function emailPanel(state) {
  const email = state.verificationMethods.find((method) => method.id === 'email');
  if (email && email.status === 'verified') {
    return `
      <div class="verify-success" role="status">
        <span class="verify-success-mark" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
        <div>
          <h4>Email address verified</h4>
          <p>Your email has been verified.</p>
        </div>
      </div>
    `;
  }

  const ready = state.checking || (email && email.status === 'sent');
  const error = state.verifyError ? `<p class="note fail">${escapeHTML(state.verifyError)}</p>` : '';
  const dev = state.devCode
    ? `<p class="dev-code">DEV MODE - Verification Code: <code>${escapeHTML(state.devCode)}</code></p>`
    : '';
  const submit = state.checking
    ? `<button type="button" class="verify-action accent" disabled aria-label="Checking"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></button>`
    : `<button type="button" class="verify-action accent" data-publish-action="submit-signature"${ready ? '' : ' disabled'}>Submit code</button>`;

  return `
    <h4 class="verify-panel-title">Email Address Verification</h4>
    <p class="verify-explain">Enter your email address in the box below. We'll send a one-time verification code to your email address with a secret cryptographic code. Enter the code in the space provided below to confirm you have access to this address.</p>
    <p class="verify-explain">Our server will then issue a signature confirming your control of the cryptographic key you will be using to affix your signature to the document.</p>
    ${dev}
    <div class="verify-form">
      <div class="verify-field">
        <label for="saitosign-verify-email">Email address</label>
        <div class="send-row">
          <input id="saitosign-verify-email" data-verify-email type="email" value="${escapeHTML(emailAddress(state))}" aria-label="Email address" autocomplete="email" />
          <button type="button" class="verify-action accent" data-publish-action="send-email">Send verification email</button>
        </div>
      </div>
      <div class="verify-field${ready ? '' : ' waiting'}">
        <label for="saitosign-verify-code">Verification code</label>
        <div class="send-row">
          <input id="saitosign-verify-code" data-verify-signature type="text" value="${escapeHTML(state.pendingCode || '')}" aria-label="Verification code" autocomplete="off"${ready && !state.checking ? '' : ' disabled'} />
          ${submit}
        </div>
      </div>
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
    title: 'Verify Your identity',
    subtitle: 'Please complete the steps below to advance.',
    disclosure: 'Any information you provide will be included in the final document, and available to any party to whom you provide access.',
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
