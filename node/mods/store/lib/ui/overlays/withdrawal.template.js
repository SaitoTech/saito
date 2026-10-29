function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SUPPORT_EMAIL = 'info@saito.io';
const SUPPORT_URL = 'https://wiki.saito.io/applications/store/payments';

function statusPanel(text) {
  return `
      <div class="activation-status" role="status" aria-live="polite">
        <div class="saito-spinner" aria-hidden="true"></div>
        <p>${escapeHtml(text)}</p>
      </div>`;
}

module.exports = ({
  state = 'loading',
  ticker = '',
  eligible = '0',
  address = '',
  error = '',
  message = '',
  statusText = '',
  supportEmail = SUPPORT_EMAIL,
  supportUrl = SUPPORT_URL
} = {}) => {
  const symbol = escapeHtml(ticker);
  const failure = error
    ? `<p class="activation-error" role="alert">${escapeHtml(error)}</p>`
    : '';

  let body = '';
  if (state === 'loading' || state === 'quoting' || state === 'signing' || state === 'submitting') {
    body = statusPanel(statusText || 'Preparing your TRX withdrawal request.');
  } else if (state === 'activate') {
    body = `
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
      <p class="activation-prompt">Support: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p>`;
  } else if (state === 'accepted' || state === 'submitted' || state === 'failed') {
    const text = message || error || 'The withdrawal request could not be completed.';
    body = `<p class="${state === 'failed' ? 'activation-error' : 'activation-prompt'}" role="status">${escapeHtml(text)}</p>`;
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
        <div class="saito-overlay-form-header-title">Withdraw ${symbol}</div>
      </div>
      ${body}
    </form>
  `;
};
