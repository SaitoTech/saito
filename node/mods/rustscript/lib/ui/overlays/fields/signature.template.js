const { buildRustscriptOverlay } = require('../overlay.shell');

module.exports = (options) => {
  const { pkDisplay, msgDisplay, canAutoSign, currentValue } = options;

  const safePk = String(pkDisplay ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const safeMsg = String(msgDisplay ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const safeValue = String(currentValue ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let manualBlock = '';
  if (!canAutoSign) {
    manualBlock = `
      <label class="rs-overlay-label" for="rs-prompt-signature-value">Signature</label>
      <textarea id="rs-prompt-signature-value" class="saito-textarea rs-prompt-value rs-prompt-signature-value" spellcheck="false" placeholder="hex signature">${safeValue}</textarea>
    `;
  }

  const actionsHtml = canAutoSign
    ? `<button type="button" class="rs-btn rs-btn-primary rs-prompt-sign-wallet">Sign with My Key</button>`
    : `<button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">Apply</button>`;

  return buildRustscriptOverlay({
    className: `rs-overlay-prompt rs-prompt-signature${canAutoSign ? ' rs-prompt-signature-auto' : ''}`,
    title: 'Sign Message',
    bodyHtml: `
      <label class="rs-overlay-label">Required Publickey</label>
      <div class="rs-prompt-signature-readonly">${safePk}</div>
      <label class="rs-overlay-label">Message</label>
      <div class="rs-prompt-signature-readonly rs-prompt-signature-message">${safeMsg}</div>
      ${manualBlock}
      <p class="rs-prompt-validation" hidden></p>
    `,
    actionsHtml
  });
};
