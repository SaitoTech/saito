module.exports = (app, mod, publickey = '', address = '', recipientIsFixed = null) => {
  let identicon = null;
  const fixedRecipient =
    recipientIsFixed === null
      ? Boolean(publickey && app.crypto.isPublicKey(publickey))
      : recipientIsFixed;

  if (fixedRecipient) {
    identicon = app.keychain.returnIdenticon(publickey);
  }

  let html = `
  <form
    class="saito-crypto-withdraw"
    id="withdrawal-form"
    action="/"
    method="POST"
    data-withdraw-step="compose"
    data-withdraw-state="review"
    ${fixedRecipient ? 'data-fixed-recipient="true"' : ''}
  >
    <header class="saito-overlay-form-header">
      <div class="crypto-logo-container header-logo" id="withdraw-header-logo-cont"></div>
      <h2 class="saito-overlay-form-header-title" id="withdraw-overlay-title">Send</h2>
    </header>

    <div id="withdraw-step-one" class="compose">
      <div class="compose-top">
        <div class="token-picker">
          <div class="token-dropdown">
            <div class="token-custom" id="withdraw-token-custom">
              <button
                type="button"
                class="token-trigger saito-button-secondary"
                id="withdraw-token-trigger"
                aria-label="Select token"
                aria-haspopup="listbox"
                aria-expanded="false"
                aria-controls="withdraw-token-menu"
              >
                <div class="token-trigger-left">
                  <div id="withdraw-logo-cont" class="token-logo"></div>
                  <span id="withdraw-token-trigger-ticker"></span>
                </div>
                <div class="token-trigger-caret" aria-hidden="true">▾</div>
              </button>
              <ul id="withdraw-token-menu" class="token-menu hide-element" role="listbox"></ul>
              <select class="saito-form-select withdraw-select-crypto hide-element" id="withdraw-select-crypto" aria-hidden="true" tabindex="-1"></select>
            </div>
          </div>
        </div>

        <div class="meta-stack" id="withdraw-balance-fee-row">
          <span class="meta-label">available</span>
          <span class="meta-value balance" id="withdraw-balance-display">--</span>
          <span class="meta-label">network fee</span>
          <span class="fee-value-wrap meta-value" id="withdraw-fee-wrap">
            <span class="fee" id="withdraw-fee-display">--</span>
          </span>
        </div>
      </div>

      <div class="fields">
        <div class="field">
          <label class="label" for="withdraw-input-address">recipient address</label>
          <div class="input-row ${fixedRecipient ? 'fixed-user' : ''}" id="withdraw-address-cont">`;

  if (identicon != null) {
    html += `<div class="identicon-slot"><img class="saito-identicon" src="${identicon}" alt=""></div>`;
  }

  html += `
            <input
              type="text"
              autocomplete="off"
              class="saito-input withdraw-address"
              ${fixedRecipient ? 'disabled' : ''}
              value="${address}"
              id="withdraw-input-address"
              required
            >
            <div class="input-actions">`;

  if (!fixedRecipient) {
    html += `
              <button type="button" class="saito-icon-button withdraw-options-cont withdraw-paste-btn" id="withdraw-paste-btn" title="Paste address">
                <i class="fa-solid fa-paste" aria-hidden="true"></i>
              </button>
              <button type="button" class="saito-icon-button withdraw-options-cont" id="withdraw-qr-scan-btn" title="Scan QR code" aria-label="Scan recipient QR code">
                <i class="fa-solid fa-qrcode" aria-hidden="true"></i>
              </button>
              <button type="button" class="saito-icon-button withdraw-options-cont" id="address-book" title="Contacts">
                <i class="fa-solid fa-users" aria-hidden="true"></i>
              </button>`;
  }

  html += `
            </div>
          </div>
          <div
            class="address-preview hide-element"
            id="withdraw-address-preview"
            aria-live="polite"
          ></div>
        </div>

        <div class="field">
          <label class="label" for="withdraw-input-amount" id="withdraw-amount-label">amount</label>
          <div class="input-row" id="withdraw-amount-cont">
            <input
              type="text"
              autocomplete="off"
              inputmode="decimal"
              class="saito-input withdraw-input-amount"
              id="withdraw-input-amount"
              value=""
              required
            >
            <div class="input-actions">
              <button type="button" class="saito-button-secondary small" id="withdraw-max-btn" title="Use maximum amount">
                MAX
              </button>
              <span
                class="withdraw-amount-status hide-element"
                id="withdraw-amount-status"
                role="status"
                aria-label=""
                tabindex="-1"
              >
                <i class="fa-solid fa-check" aria-hidden="true"></i>
              </span>
            </div>
            <div
              class="withdraw-amount-tooltip"
              id="withdraw-amount-tooltip"
              role="tooltip"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div id="withdraw-step-two" class="review hide-element">
      <div class="confirm-body">
        <div class="confirm-status" id="withdraw-confirm-status" aria-live="polite">
          <div class="saito-spinner spinner confirm-spinner" id="withdraw-confirm-spinner"></div>
          <i
            id="withdraw-confirm-icon-success"
            class="confirm-result-icon confirm-result-icon--success fa-solid fa-circle-check hide-element"
            aria-hidden="true"
          ></i>
          <i
            id="withdraw-confirm-icon-failure"
            class="confirm-result-icon confirm-result-icon--failure fa-solid fa-circle-xmark hide-element"
            aria-hidden="true"
          ></i>
        </div>

        <div class="send-result hide-element" id="withdraw-send-result" role="status" aria-live="polite">
          <h3 class="send-result-title" id="withdraw-send-result-title"></h3>
          <p class="send-result-message" id="withdraw-send-result-message"></p>
        </div>

        <div class="confirm-details">
          <section class="confirm-block" aria-labelledby="withdraw-confirm-amount-label">
            <div class="confirm-label" id="withdraw-confirm-amount-label">send</div>
            <div class="confirm-amount" id="withdraw-confirm-amount"></div>
          </section>

          <section class="confirm-block" aria-labelledby="withdraw-confirm-recipient-label">
            <div class="confirm-label" id="withdraw-confirm-recipient-label">to</div>
            <div class="confirm-chain-address" id="withdraw-confirm-address"></div>
            <div class="withdraw-confirm-counterparty counterparty-details hide-element" id="withdraw-confirm-counterparty"></div>
          </section>

          <section class="confirm-block confirm-fee" aria-labelledby="withdraw-confirm-fee-label">
            <div class="confirm-label" id="withdraw-confirm-fee-label">network fee</div>
            <div class="confirm-fee-value" id="withdraw-confirm-fee"></div>
          </section>
        </div>

        <div class="confirm-tx hide-element" id="withdraw-confirm-tx-row">
          <div class="confirm-label">transaction</div>
          <div class="confirm-tx-inline">
            <div class="confirm-tx-hash" id="withdraw-confirm-tx-hash"></div>
            <button
              type="button"
              class="saito-icon-button"
              id="withdraw-confirm-tx-copy"
              title="Copy transaction hash"
            >
              <i class="fas fa-copy" aria-hidden="true"></i>
              <span class="visually-hidden">Copy</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="saito-button-row actions" id="withdraw-footer-compose">
      <button
        type="submit"
        form="withdrawal-form"
        class="withdraw-submit saito-button-primary fat"
        id="saito-overlay-submit"
        disabled
      >
        Send
      </button>
    </div>

    <div class="saito-button-row actions hide-element" id="withdraw-footer-review">
      <button type="button" class="saito-button-secondary fat" id="withdraw-edit">Edit</button>
      <button type="button" class="saito-button-primary fat" id="withdraw-confirm">Confirm send</button>
    </div>

    <div class="saito-button-row actions hide-element" id="withdraw-footer-success">
      <a class="saito-button-secondary fat" id="withdraw-view-history" href="#">View history</a>
      <button type="button" class="saito-button-primary fat" id="withdraw-done">Done</button>
    </div>

    <div class="saito-button-row actions hide-element" id="withdraw-footer-failed">
      <button type="button" class="saito-button-secondary fat" id="withdraw-try-edit">Edit</button>
      <button type="button" class="saito-button-primary fat" id="withdraw-try-again">Try again</button>
    </div>
  </form>
  `;

  return html;
};
