module.exports = (options) => {
  const {
    pkDisplay,
    msgDisplay,
    canAutoSign,
    currentValue
  } = options;

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
      <label class="rs-prompt-label" for="rs-prompt-signature-value">Signature</label>
      <textarea id="rs-prompt-signature-value" class="rs-prompt-value rs-prompt-signature-value" spellcheck="false" placeholder="hex signature">${safeValue}</textarea>
    `;
  }

  const actions = canAutoSign
    ? `<div class="overlay-actions overlay-actions-apply-only">
        <button type="button" class="rs-btn rs-btn-primary rs-prompt-sign-wallet">Sign with My Key</button>
      </div>`
    : `<div class="overlay-actions overlay-actions-apply-only">
        <button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">Apply</button>
      </div>`;

  return `
<div class="rustscript-overlay rs-prompt-overlay rs-prompt-signature${canAutoSign ? ' rs-prompt-signature-auto' : ''}">
  <h2 class="rs-prompt-title">Sign Message</h2>
  <label class="rs-prompt-label">Required Publickey</label>
  <div class="rs-prompt-signature-readonly">${safePk}</div>
  <label class="rs-prompt-label">Message</label>
  <div class="rs-prompt-signature-readonly rs-prompt-signature-message">${safeMsg}</div>
  ${manualBlock}
  <p class="rs-prompt-validation" hidden></p>
  ${actions}
</div>
`;
};
