const methodsTemplate = require('./publish.methods');
const { escapeHTML } = require('./publish.escape');

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

function verifySlide(state) {
  const upsell = state.verificationMethods.find((method) => method.id === state.upsell);
  const panel = upsell
    ? `<p class="heading">${escapeHTML(upsell.description)}</p>`
    : emailPanel(state);

  return {
    title: 'Verify Identity',
    body: `
      <div class="verify-flow">
        ${methodsTemplate(state.verificationMethods, state.upsell || 'email')}
        <div class="detail">
          ${panel}
        </div>
      </div>
    `
  };
}

module.exports = verifySlide;
