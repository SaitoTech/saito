module.exports = (app, mod, publickey = '', address = '') => {
  let identicon = null;
  const fixedRecipient = Boolean(publickey && app.crypto.isPublicKey(publickey));

  if (fixedRecipient) {
    identicon = app.keychain.returnIdenticon(publickey);
  }

  let html = `
  <form
    class="saito-overlay-form withdraw-overlay"
    id="withdrawal-form"
    action="/"
    method="POST"
    data-withdraw-step="compose"
    data-withdraw-state="review"
    ${fixedRecipient ? 'data-fixed-recipient="true"' : ''}
  >
    <div class="withdraw-overlay__surface">
      <header class="saito-overlay-form-header withdraw-overlay__header">
        <div class="crypto-logo-container withdraw-header-logo-cont" id="withdraw-header-logo-cont"></div>
        <div class="saito-overlay-form-header-title">
          <h2 class="withdraw-overlay__title" id="withdraw-overlay-title">Send</h2>
        </div>
      </header>

      <main class="withdraw-overlay__main">
        <div id="withdraw-step-one" class="withdraw-overlay__compose">
          <div class="withdraw-compose-top">
            <div class="withdraw-token-picker">
              <label class="withdraw-field-label" for="withdraw-token-trigger">Token</label>
              <div class="saito-overlay-form-input">
                <div class="token-dropdown">
                  <div class="withdraw-token-custom" id="withdraw-token-custom">
                    <button
                      type="button"
                      class="withdraw-token-trigger"
                      id="withdraw-token-trigger"
                      aria-haspopup="listbox"
                      aria-expanded="false"
                      aria-controls="withdraw-token-menu"
                    >
                      <div class="withdraw-token-trigger-left">
                        <div id="withdraw-logo-cont" class="withdraw-logo-cont"></div>
                        <span id="withdraw-token-trigger-ticker"></span>
                      </div>
                      <div class="withdraw-token-trigger-caret" aria-hidden="true">▾</div>
                    </button>
                    <ul id="withdraw-token-menu" class="withdraw-token-menu hide-element" role="listbox"></ul>
                    <select class="withdraw-select-crypto hide-element" id="withdraw-select-crypto" aria-hidden="true" tabindex="-1"></select>
                  </div>
                </div>
              </div>
            </div>

            <div class="withdraw-balance-fee-stack" id="withdraw-balance-fee-row">
              <div class="withdraw-meta-line">
                <span class="withdraw-info-title">Available</span>
                <span class="withdraw-info-value balance" id="withdraw-balance-display">--</span>
              </div>
              <div class="withdraw-meta-line">
                <span class="withdraw-info-title">Network fee</span>
                <span class="withdraw-fee-value-wrap" id="withdraw-fee-wrap">
                  <span class="withdraw-info-value fee" id="withdraw-fee-display">--</span>
                  <i class="fas fa-pen withdraw-fee-edit-icon hide-element" id="withdraw-fee-edit-icon" aria-hidden="true"></i>
                </span>
              </div>
            </div>
          </div>

          <div class="input-elements-container">
            <div class="saito-overlay-form-input withdraw-field-group">
              <label class="withdraw-field-label" for="withdraw-input-address">Recipient address</label>
              <div class="withdraw-input-cont ${fixedRecipient ? 'fixed-user' : ''}" id="withdraw-address-cont">`;

  if (identicon != null) {
    html += `<div class="withdraw-identicon-container"><img class="saito-identicon" src="${identicon}" alt=""></div>`;
  }

  html += `
                <input
                  type="text"
                  autocomplete="off"
                  class="withdraw_address"
                  ${fixedRecipient ? 'disabled' : ''}
                  value="${address}"
                  id="withdraw-input-address"
                  required
                >`;

  if (!fixedRecipient) {
    html += `
                <button type="button" class="withdraw-options-cont withdraw-paste-btn" id="withdraw-paste-btn" title="Paste address">
                  <i class="fa-solid fa-paste" aria-hidden="true"></i>
                </button>
                <button type="button" class="withdraw-options-cont" id="address-book" title="Contacts">
                  <i class="fa-solid fa-users" aria-hidden="true"></i>
                </button>`;
  }

  html += `
              </div>
              <div class="withdraw-error-slot" aria-live="polite">
                <div class="withdraw-error" id="withdraw-address-error" role="alert"></div>
              </div>
            </div>

            <div class="saito-overlay-form-input withdraw-field-group">
              <label class="withdraw-field-label" for="withdraw-input-amount" id="withdraw-amount-label">Amount</label>
              <div class="withdraw-input-cont" id="withdraw-amount-cont">
                <input
                  type="number"
                  autocomplete="off"
                  min="0"
                  max="9999999999.99999999"
                  step="0.00000001"
                  class="withdraw-input-amount"
                  id="withdraw-input-amount"
                  value=""
                  required
                >
                <button type="button" class="withdraw-max-btn" id="withdraw-max-btn" title="Use maximum amount">
                  MAX
                </button>
              </div>
              <div class="withdraw-error-slot" aria-live="polite">
                <div class="withdraw-error" id="withdraw-amount-error" role="alert"></div>
              </div>
            </div>
          </div>
        </div>

        <div id="withdraw-step-two" class="withdraw-overlay__review hide-element">
          <div class="withdraw-confirm-overlay__body">
            <div class="withdraw-confirm-overlay__status" id="withdraw-confirm-status" aria-live="polite">
              <div class="saito_spinner spinner withdraw-confirm-overlay__spinner" id="withdraw-confirm-spinner"></div>
              <i
                id="withdraw-confirm-icon-success"
                class="withdraw-confirm-overlay__result-icon withdraw-confirm-overlay__result-icon--success fa-solid fa-circle-check hide-element"
                aria-hidden="true"
              ></i>
              <i
                id="withdraw-confirm-icon-failure"
                class="withdraw-confirm-overlay__result-icon withdraw-confirm-overlay__result-icon--failure fa-solid fa-circle-xmark hide-element"
                aria-hidden="true"
              ></i>
            </div>

            <div class="withdraw-send-result hide-element" id="withdraw-send-result" role="status" aria-live="polite">
              <h3 class="withdraw-send-result__title" id="withdraw-send-result-title"></h3>
              <p class="withdraw-send-result__message" id="withdraw-send-result-message"></p>
            </div>

            <div class="withdraw-confirm-overlay__review-details">
              <section class="withdraw-confirm-overlay__summary" aria-labelledby="withdraw-confirm-amount-label">
                <div class="withdraw-confirm-overlay__summary-label" id="withdraw-confirm-amount-label">Send</div>
                <div class="withdraw-confirm-overlay__amount" id="withdraw-confirm-amount"></div>
              </section>

              <section class="withdraw-confirm-overlay__recipient" aria-labelledby="withdraw-confirm-recipient-label">
                <div class="withdraw-confirm-overlay__summary-label" id="withdraw-confirm-recipient-label">TO</div>
                <div class="withdraw-confirm-counterparty counterparty-details hide-element" id="withdraw-confirm-counterparty"></div>
                <div class="withdraw-confirm-overlay__chain-address" id="withdraw-confirm-address"></div>
              </section>

              <section class="withdraw-confirm-overlay__fee-row" aria-labelledby="withdraw-confirm-fee-label">
                <div class="withdraw-confirm-overlay__summary-label" id="withdraw-confirm-fee-label">Network fee</div>
                <div class="withdraw-confirm-overlay__fee" id="withdraw-confirm-fee"></div>
              </section>
            </div>

            <div class="withdraw-confirm-overlay__tx-row hide-element" id="withdraw-confirm-tx-row">
              <div class="withdraw-confirm-overlay__summary-label">Transaction</div>
              <div class="withdraw-confirm-overlay__tx-inline">
                <div class="withdraw-confirm-overlay__tx-hash" id="withdraw-confirm-tx-hash"></div>
                <div
                  class="withdraw-confirm-copy-btn"
                  id="withdraw-confirm-tx-copy"
                  role="button"
                  tabindex="0"
                  title="Copy transaction hash"
                >
                  <i class="fas fa-copy" aria-hidden="true"></i>
                  <span class="visually-hidden">Copy</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer class="withdraw-overlay__footer-bar">
        <div class="saito-button-row withdraw-overlay__actions" id="withdraw-footer-compose">
          <button
            type="submit"
            form="withdrawal-form"
            class="withdraw-submit saito-button-primary"
            id="saito-overlay-submit"
          >
            Review
          </button>
        </div>

        <div class="saito-button-row withdraw-overlay__actions hide-element" id="withdraw-footer-review">
          <button type="button" class="saito-button-secondary" id="withdraw-edit">Edit</button>
          <button type="button" class="saito-button-primary" id="withdraw-confirm">Confirm send</button>
        </div>

        <div class="saito-button-row withdraw-overlay__actions hide-element" id="withdraw-footer-pending">
          <span class="withdraw-confirm-overlay__pending-label" id="withdraw-pending-label">Broadcasting…</span>
        </div>

        <div class="saito-button-row withdraw-overlay__actions hide-element" id="withdraw-footer-success">
          <button type="button" class="saito-button-secondary" id="withdraw-view-history">View history</button>
          <button type="button" class="saito-button-primary" id="withdraw-done">Done</button>
        </div>

        <div class="saito-button-row withdraw-overlay__actions hide-element" id="withdraw-footer-failed">
          <button type="button" class="saito-button-secondary" id="withdraw-try-edit">Edit</button>
          <button type="button" class="saito-button-primary" id="withdraw-try-again">Try again</button>
        </div>
      </footer>
    </div>
  </form>
  `;

  return html;
};
