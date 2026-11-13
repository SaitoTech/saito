function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SUPPORT_EMAIL = 'info@saito.io';
const SUPPORT_URL = 'https://wiki.saito.io/applications/store/payments';

function supportLink(email = SUPPORT_EMAIL) {
  const safe = escapeHtml(email);
  return `<a href="mailto:${safe}">${safe}</a>`;
}

function statusPanel(text) {
  return `
      <div class="activation-status" role="status" aria-live="polite">
        <div class="saito-spinner" aria-hidden="true"></div>
        <p>${escapeHtml(text)}</p>
      </div>`;
}

function trxProblem(email) {
  return `<p class="activation-error" role="alert">We are having a problem processing this payment. Please send us an email at ${supportLink(
    email
  )} for us to look into it manually.</p>`;
}

function trxQueued(email) {
  return `
      <p class="activation-prompt">Your withdrawal request is now queued for withdrawal.</p>
      <p class="activation-prompt">If you've provided an email address, you should receive a notification shortly and an update when your funds are transferred.</p>
      <p class="activation-prompt">If you did not provide an email address, please allow 24 hours for processing. When you come back after that period, the funds should be in your SAITO TRX wallet, which can be accessed from your wallet <a href="#" data-action="open-wallet">here</a>.</p>
      <p class="activation-prompt">If you run into problems, email us at ${supportLink(email)}.</p>`;
}

function trxReady({ address = '', email = '', supportEmail = SUPPORT_EMAIL } = {}) {
  return `
      <p class="activation-prompt">Your account is ready for withdrawal. It may take up to 24 hours to send the funds. If you provide an email address, we will email you to update you on the status of your withdrawal as it is processed. Please be patient.</p>
      <p class="activation-prompt">If you need support, email us at ${supportLink(supportEmail)}.</p>
      <label class="detail">
        <span>Email (optional)</span>
        <input class="saito-input" type="email" name="email" value="${escapeHtml(email)}" autocomplete="email" />
      </label>
      <label class="detail">
        <span>TRX withdrawal address</span>
        <input class="saito-input" type="text" name="address" value="${escapeHtml(address)}" readonly />
      </label>
      <div class="saito-button-row">
        <button type="button" class="saito-button-primary" data-action="confirm-withdraw">Withdraw</button>
      </div>`;
}

module.exports = ({
  state = 'loading',
  ticker = '',
  eligible = '0',
  address = '',
  email = '',
  error = '',
  message = '',
  statusText = '',
  supportEmail = SUPPORT_EMAIL,
  supportUrl = SUPPORT_URL
} = {}) => {
  const symbol = escapeHtml(ticker);
  const trx = String(ticker || '').trim().toUpperCase() === 'TRX';
  const failure = error
    ? `<p class="activation-error" role="alert">${escapeHtml(error)}</p>`
    : '';

  let body = '';
  if (state === 'loading' || state === 'quoting' || state === 'signing' || state === 'submitting') {
    body = statusPanel(statusText || 'Preparing your TRX withdrawal request.');
  } else if (state === 'activate') {
    body = trx
      ? `
      ${failure}
      <p class="activation-prompt">In order to withdraw TRX, you must first enable TRX support in your SAITO Wallet to have a local deposit address to which your funds can be sent.</p>
      <p class="activation-prompt">Once the transfer is complete, you can move them to any other address.</p>
      <p class="activation-prompt">Click on the button below to enable TRX support.</p>
      <div class="saito-button-row">
        <button type="button" class="saito-button-primary" data-action="activate-account">Enable TRX</button>
      </div>`
      : `
      ${failure}
      <p class="activation-prompt">You need a ${symbol} withdrawal address to receive your crypto. Create one below to continue.</p>
      <div class="saito-button-row">
        <button type="button" class="saito-button-primary" data-action="activate-account">Create ${symbol} account</button>
      </div>`;
  } else if (state === 'ineligible') {
    body = `<p class="activation-prompt">No ${symbol} proceeds are eligible for withdrawal.</p>`;
  } else if (state === 'insufficient') {
    body = `
      <p class="activation-error" role="alert">This wallet does not contain enough SAITO to complete the withdrawal request.</p>
      <p class="activation-prompt"><a href="${escapeHtml(supportUrl)}">How Store payments work</a></p>
      <p class="activation-prompt">Support: ${supportLink(supportEmail)}</p>`;
  } else if (state === 'accepted' || state === 'submitted' || state === 'failed') {
    if (trx && state === 'submitted') {
      body = trxQueued(supportEmail);
    } else if (trx) {
      body = trxProblem(supportEmail);
    } else {
      const text = message || error || 'The withdrawal request could not be completed.';
      body = `<p class="${state === 'failed' ? 'activation-error' : 'activation-prompt'}" role="status">${escapeHtml(text)}</p>`;
    }
  } else if (trx) {
    body = trxReady({ address, email, supportEmail });
  } else {
    body = `
      <label class="detail">
        <span>Address</span>
        <input class="saito-input" type="text" name="address" value="${escapeHtml(address)}" readonly />
      </label>
      <label class="detail">
        <span>Amount</span>
        <input class="saito-input" type="text" name="amount" value="${escapeHtml(String(eligible))}" readonly />
      </label>
      <div class="saito-button-row">
        <button type="button" class="saito-button-primary" data-action="confirm-withdraw">Withdraw</button>
      </div>`;
  }

  return `
    <form class="saito-overlay-form store-withdrawal">
      <div class="saito-overlay-form-header">
        <div class="saito-overlay-form-header-title">${trx ? `WITHDRAW ${symbol}` : `Withdraw ${symbol}`}</div>
      </div>
      ${body}
    </form>
  `;
};
