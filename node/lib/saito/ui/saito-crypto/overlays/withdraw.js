const WithdrawTemplate = require('./withdraw.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoContacts = require('./../../modals/saito-contacts/saito-contacts');
const SaitoNFT = require('../../saito-nft/saito-nft');
const SaitoUser = require('./../../saito-user/saito-user');

class Withdraw {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.contacts = new SaitoContacts(app, mod);
    this.counterparty = new SaitoUser(app, mod, '#withdrawal-form .withdraw-confirm-counterparty');

    this.ticker = '';
    this.pc = null;
    this.publicKey = '';
    this.fixedRecipient = false;
    this.address = '';
    this.recipientAddressValid = false;
    this.fee = null;
    this.feePending = false;
    this.feeRequestKey = '';
    this.feeRequestPromise = null;
    this.lastTxHash = '';
    this.amountErrorMessage = '';

    this.errors = {
      amount: false,
      address: false
    };

    this.available_balance = 0;
    this._nft_balance_raw = null;

    this.app.connection.on('saito-crypto-withdraw-render-request', async (obj) => {
      this.ticker = obj?.ticker || '';
      this.publicKey = obj?.address || '';
      this.fixedRecipient = Boolean(this.publicKey && this.app.crypto.isPublicKey(this.publicKey));

      if (this.ticker) {
        await this.app.wallet.setPreferredCrypto(this.ticker);
      }

      this.render();
    });
  }

  async render() {
    this.closeTokenMenu();
    this.pc = this.app.wallet.returnPreferredCrypto();
    this.ticker = this.pc.ticker;
    this.amountErrorMessage = '';
    this.recipientAddressValid = false;

    if (this.publicKey) {
      this.address = await this.pc.returnAddressFromPublicKey(this.publicKey);
    }

    if (document.getElementById('withdrawal-form')) {
      this.app.browser.replaceElementById(
        WithdrawTemplate(this.app, this.mod, this.publicKey, this.address, this.fixedRecipient),
        'withdrawal-form'
      );
    } else {
      this.overlay.show(
        WithdrawTemplate(this.app, this.mod, this.publicKey, this.address, this.fixedRecipient),
        () => {
          this.clear();
        }
      );
    }

    await this.loadCryptos();
    await this.refreshAvailableBalanceDisplay();
    this.updateComposeLabels();

    document
      .querySelectorAll(`#withdraw-logo-cont img[data-ticker="${this.pc.ticker}"]`)
      .forEach((el) => el.classList.remove('hide-element'));

    await this.fetchWithdrawFee();
    this.setWithdrawStep('compose');
    this.setWithdrawState('review');
    this.updateHeaderTitle();
    this.updateHeaderLogos();
    this.attachEvents();
    await this.updateAddressUiFromInput({ fetchFee: false });
    this.updateAmountActionState();
    this.updateSuccessAction();
    this.handleErrors();
  }

  updateHeaderTitle() {
    const title = document.getElementById('withdraw-overlay-title');
    if (title) {
      title.textContent = 'Send';
    }
  }

  updateHeaderLogos() {
    const cont = document.getElementById('withdraw-header-logo-cont');
    if (!cont || !this.pc) {
      return;
    }
    const icons = this.pc.returnLogos();
    let html = `<img class="crypto-logo" src="${icons.img}" alt="" />`;
    if (icons.sub_logo) {
      html += `<img class="chain-logo" src="${icons.sub_logo}" alt="" />`;
    }
    cont.innerHTML = html;
  }

  updateComposeLabels() {
    const amountLabel = document.getElementById('withdraw-amount-label');
    const amountInput = document.getElementById('withdraw-input-amount');
    if (!amountLabel || !amountInput) {
      return;
    }
    if (this.isNftWithdrawSelection()) {
      amountLabel.textContent = 'units';
      amountInput.inputMode = 'numeric';
    } else {
      amountLabel.textContent = 'amount';
      amountInput.inputMode = 'decimal';
    }
  }

  getAmountMaxFractionDigits() {
    return this.isNftWithdrawSelection() ? 0 : 8;
  }

  normalizeAmountInput(options = {}) {
    const input = document.getElementById('withdraw-input-amount');
    return this.app.browser.formatLocaleAmountInputElement(input, {
      maxFractionDigits: this.getAmountMaxFractionDigits(),
      strictLocaleSeparators: options.strictLocaleSeparators !== false
    });
  }

  getAmountInputValue() {
    const input = document.getElementById('withdraw-input-amount');
    if (!input) {
      return '';
    }
    const parsed = this.app.browser.parseLocaleAmount(input.value, {
      maxFractionDigits: this.getAmountMaxFractionDigits(),
      strictLocaleSeparators: true
    });
    return parsed.valid ? parsed.normalized : '';
  }

  getAmountInputDisplayValue() {
    const input = document.getElementById('withdraw-input-amount');
    if (!input) {
      return '';
    }
    const value = this.getAmountInputValue();
    return value
      ? this.app.browser.formatLocaleAmount(value, {
          maxFractionDigits: this.getAmountMaxFractionDigits(),
          strictLocaleSeparators: false
        })
      : input.value;
  }

  setAmountInputValue(value = '') {
    const input = document.getElementById('withdraw-input-amount');
    if (!input) {
      return;
    }
    input.value = String(value);
    this.normalizeAmountInput({ strictLocaleSeparators: false });
    this.resetAmountValidation();
  }

  hasAmountInputValue() {
    return this.getAmountInputValue() !== '';
  }

  resetAmountValidation() {
    this.clearAmountError();
    this.updateAmountActionState();
    this.handleErrors();
  }

  updateAmountActionState() {
    const amountInput = document.getElementById('withdraw-input-amount');
    const hasAmount = Boolean(amountInput?.value?.trim());
    const hasValidAmount =
      hasAmount && this.hasAmountInputValue() && this.errors['amount'] === false;
    const hasInvalidAmount = hasAmount && !hasValidAmount;
    const maxBtn = document.getElementById('withdraw-max-btn');
    const status = document.getElementById('withdraw-amount-status');
    const tooltip = document.getElementById('withdraw-amount-tooltip');

    maxBtn?.classList.toggle('hide-element', hasAmount);

    if (status) {
      const icon = status.querySelector('i');
      status.classList.toggle('hide-element', !hasAmount);
      status.classList.toggle('withdraw-amount-status--valid', hasValidAmount);
      status.classList.toggle('withdraw-amount-status--invalid', hasInvalidAmount);
      status.tabIndex = hasInvalidAmount ? 0 : -1;
      status.setAttribute(
        'aria-label',
        hasInvalidAmount ? this.amountErrorMessage : hasValidAmount ? 'Amount can be sent' : ''
      );
      if (hasInvalidAmount) {
        status.setAttribute('aria-describedby', 'withdraw-amount-tooltip');
      } else {
        status.removeAttribute('aria-describedby');
      }
      if (icon) {
        icon.className = hasInvalidAmount ? 'fa-solid fa-xmark' : 'fa-solid fa-check';
      }
    }

    if (amountInput) {
      amountInput.setAttribute('aria-invalid', hasInvalidAmount ? 'true' : 'false');
      if (hasInvalidAmount) {
        amountInput.setAttribute('aria-describedby', 'withdraw-amount-tooltip');
      } else {
        amountInput.removeAttribute('aria-describedby');
      }
    }
    if (tooltip) {
      tooltip.textContent = hasInvalidAmount ? this.amountErrorMessage : '';
    }
  }

  isNativeSaitoSelection() {
    return this.pc?.chain_id === 'NATIVE';
  }

  escapeHTML(value = '') {
    return this.app?.browser?.escapeHTML
      ? this.app.browser.escapeHTML(String(value))
      : String(value);
  }

  returnRegisteredIdentifier(publicKey = '') {
    const identifier = this.app.keychain.returnIdentifierByPublicKey(publicKey);
    return identifier && identifier !== publicKey ? identifier : '';
  }

  isFixedRecipientForm() {
    const form = document.getElementById('withdrawal-form');
    if (form) {
      return form.dataset.fixedRecipient === 'true';
    }
    return this.fixedRecipient;
  }

  renderSaitoRecipientPreview(publicKey = '') {
    const preview = document.getElementById('withdraw-address-preview');
    if (!preview || !publicKey) {
      return;
    }

    const identifier = this.returnRegisteredIdentifier(publicKey);
    const primary = identifier || publicKey;
    const secondary = identifier ? publicKey : 'No registered name';
    const identicon = this.app.keychain.returnIdenticon(publicKey);
    const fixedRecipient = this.isFixedRecipientForm();

    preview.innerHTML = `
      <div class="saito-user address-user" data-id="${this.escapeHTML(publicKey)}" data-disable="true">
        <div class="saito-identicon-box">
          <img class="saito-identicon" src="${this.escapeHTML(identicon)}" data-id="${this.escapeHTML(publicKey)}" data-disable="true">
        </div>
        <div class="saito-address" title="${this.escapeHTML(primary)}">${this.escapeHTML(primary)}</div>
        <div class="saito-userline" title="${this.escapeHTML(secondary)}">${this.escapeHTML(secondary)}</div>
        <button type="button" class="saito-icon-button address-edit ${fixedRecipient ? 'hide-element' : ''}" id="withdraw-address-edit" title="Edit recipient address" aria-label="Edit recipient address">
          <i class="fa-solid fa-pen" aria-hidden="true"></i>
        </button>
      </div>
    `;

    this.attachAddressPreviewEvents();
  }

  formatChainAddressForDisplay(address = '') {
    const value = String(address || '');
    return value.includes('|') ? value.split('|')[0] : value;
  }

  renderExternalRecipientPreview(address = '', publicKey = '') {
    const preview = document.getElementById('withdraw-address-preview');
    if (!preview || !address) {
      return;
    }

    const displayAddress = this.formatChainAddressForDisplay(address);
    const hasPublicKey = publicKey && this.app.crypto.isPublicKey(publicKey);
    const identifier = hasPublicKey ? this.returnRegisteredIdentifier(publicKey) : '';
    const primary = hasPublicKey ? identifier || publicKey : 'External Address';
    const secondary = hasPublicKey ? publicKey : 'No matching Saito user';
    const identicon = hasPublicKey ? this.app.keychain.returnIdenticon(publicKey) : '';

    preview.innerHTML = `
      <div class="address-external">
        <div class="address-external-address" title="${this.escapeHTML(displayAddress)}">${this.escapeHTML(displayAddress)}</div>
        <div class="address-external-user ${hasPublicKey ? 'saito-user address-external-user--matched' : 'address-external-user--unknown'}" ${hasPublicKey ? `data-id="${this.escapeHTML(publicKey)}" data-disable="true"` : ''}>
          ${
            hasPublicKey
              ? `<div class="saito-identicon-box">
                  <img class="saito-identicon" src="${this.escapeHTML(identicon)}" data-id="${this.escapeHTML(publicKey)}" data-disable="true">
                </div>`
              : `<div class="address-external-unknown-icon">
                  <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
                </div>`
          }
          <div class="saito-address" title="${this.escapeHTML(primary)}">
            ${this.escapeHTML(primary)}
            ${hasPublicKey ? '<span class="address-match-label">Matched</span>' : ''}
          </div>
          <div class="saito-userline" title="${this.escapeHTML(secondary)}">${this.escapeHTML(secondary)}</div>
        </div>
        <button type="button" class="saito-icon-button address-edit" id="withdraw-address-edit" title="Edit recipient address" aria-label="Edit recipient address">
          <i class="fa-solid fa-pen" aria-hidden="true"></i>
        </button>
      </div>
    `;

    this.attachAddressPreviewEvents();
  }

  renderInvalidRecipientPreview() {
    const preview = document.getElementById('withdraw-address-preview');
    if (!preview) {
      return;
    }

    preview.innerHTML = `
      <div class="address-invalid" role="alert">
        <div class="address-invalid-message">${this.escapeHTML(`Error: Invalid ${this.ticker} address`)}</div>
        <button type="button" class="saito-icon-button address-edit" id="withdraw-address-edit" title="Edit recipient address" aria-label="Edit recipient address">
          <i class="fa-solid fa-pen" aria-hidden="true"></i>
        </button>
      </div>
    `;

    this.attachAddressPreviewEvents({ preserveValue: true });
  }

  attachAddressPreviewEvents({ preserveValue = false } = {}) {
    const editBtn = document.getElementById('withdraw-address-edit');
    if (!editBtn) {
      return;
    }

    const edit = (e) => {
      e.preventDefault();
      this.showAddressInputForEdit({ preserveValue });
    };

    editBtn.onclick = edit;
    editBtn.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        edit(e);
      }
    };
  }

  showAddressPreview() {
    const cont = document.getElementById('withdraw-address-cont');
    const preview = document.getElementById('withdraw-address-preview');
    if (!cont || !preview) {
      return;
    }

    clearTimeout(this.addressPreviewTransitionTimer);

    if (cont.classList.contains('hide-element')) {
      preview.classList.remove('hide-element');
      preview.classList.remove('address-preview--enter');
      preview.classList.add('address-preview--enter-active');
      return;
    }

    preview.classList.add('hide-element');
    preview.classList.remove('address-preview--enter-active');
    cont.classList.add('address-transition-out');

    this.addressPreviewTransitionTimer = setTimeout(() => {
      cont.classList.add('hide-element');
      cont.classList.remove('address-transition-out');
      preview.classList.remove('hide-element');
      preview.classList.add('address-preview--enter');
      requestAnimationFrame(() => {
        preview.classList.add('address-preview--enter-active');
        preview.classList.remove('address-preview--enter');
      });
    }, 333);
  }

  hideAddressPreview() {
    clearTimeout(this.addressPreviewTransitionTimer);
    const preview = document.getElementById('withdraw-address-preview');
    const cont = document.getElementById('withdraw-address-cont');
    preview?.classList.add('hide-element');
    preview?.classList.remove('address-preview--enter', 'address-preview--enter-active');
    cont?.classList.remove('hide-element', 'address-transition-out');
  }

  showAddressInputForEdit({ preserveValue = false } = {}) {
    this.hideAddressPreview();
    const input = document.getElementById('withdraw-input-address');
    if (input && !input.disabled) {
      this.address = '';
      this.recipientAddressValid = false;
      if (!this.isFixedRecipientForm()) {
        this.publicKey = '';
      }
      if (!preserveValue) {
        input.value = '';
      }
      this.clearAddressError();
      void this.fetchWithdrawFee();
      this.handleErrors();
      input.focus();
    }
  }

  async updateAddressUiFromInput({ showError = false, fetchFee = true } = {}) {
    const input = document.getElementById('withdraw-input-address');
    if (!input || !this.pc) {
      return false;
    }

    const address = input.value.trim();
    if (!address) {
      this.address = '';
      this.recipientAddressValid = false;
      if (!this.isFixedRecipientForm()) {
        this.publicKey = '';
      }
      this.hideAddressPreview();
      this.handleErrors();
      return false;
    }

    const valid = this.pc.validateAddress(address);
    if (!valid) {
      this.address = '';
      this.recipientAddressValid = false;
      if (!this.isFixedRecipientForm()) {
        this.publicKey = '';
      }
      if (showError) {
        this.errors['address'] = true;
        this.renderInvalidRecipientPreview();
        this.showAddressPreview();
      } else {
        this.hideAddressPreview();
      }
      this.handleErrors();
      return false;
    }

    this.address = address;
    this.recipientAddressValid = true;
    this.clearAddressError();

    if (this.isNativeSaitoSelection()) {
      this.publicKey = address;
      this.renderSaitoRecipientPreview(address);
      this.showAddressPreview();
    } else {
      let publicKey = this.app.crypto.isPublicKey(this.publicKey) ? this.publicKey : '';
      if (typeof this.pc.getSaitoPublicKey === 'function') {
        try {
          const resolvedPublicKey = await this.pc.getSaitoPublicKey(address);
          if (resolvedPublicKey && this.app.crypto.isPublicKey(resolvedPublicKey)) {
            this.publicKey = resolvedPublicKey;
            publicKey = resolvedPublicKey;
          } else if (!this.isFixedRecipientForm()) {
            this.publicKey = '';
            publicKey = '';
          }
        } catch (err) {
          console.warn('Withdraw: unable to resolve Saito public key for address', err);
          if (!this.isFixedRecipientForm()) {
            this.publicKey = '';
            publicKey = '';
          }
        }
      }
      if (!this.isFixedRecipientForm()) {
        this.publicKey = publicKey;
      }
      this.renderExternalRecipientPreview(address, publicKey);
      this.showAddressPreview();
    }

    if (fetchFee) {
      await this.fetchWithdrawFee();
    }

    this.updateAmountActionState();
    this.handleErrors();
    return true;
  }

  formatFeeTicker() {
    if (!this.pc) {
      return this.ticker || '';
    }
    return this.pc.chain_id === 'NATIVE' ? 'SAITO' : this.ticker;
  }

  getNativeDefaultFee() {
    try {
      const configuredFee =
        this.app.wallet.default_fee ?? this.app.options?.wallet?.default_fee ?? BigInt(0);
      const fee = Number(this.app.wallet.convertNolanToSaito(BigInt(configuredFee)));
      return Number.isFinite(fee) && fee >= 0 ? fee : 0;
    } catch (err) {
      return 0;
    }
  }

  formatFeeDisplay(amt) {
    const n = Number(amt);
    if (!Number.isFinite(n)) {
      return '--';
    }
    if (n === 0) {
      return `0 ${this.formatFeeTicker()}`;
    }
    return `${this.app.browser.formatDecimals(String(n))} ${this.formatFeeTicker()}`;
  }

  setFeeDisplayElement(el, text, title = '') {
    if (!el) {
      return;
    }
    el.textContent = text;
    if (title) {
      el.setAttribute('title', title);
    } else {
      el.removeAttribute('title');
    }
  }

  setWithdrawStep(step) {
    const form = document.getElementById('withdrawal-form');
    const one = document.getElementById('withdraw-step-one');
    const two = document.getElementById('withdraw-step-two');

    if (form) {
      form.dataset.withdrawStep = step;
    }
    if (one) {
      one.classList.toggle('hide-element', step !== 'compose');
    }
    if (two) {
      two.classList.toggle('hide-element', step !== 'review');
    }

    document
      .getElementById('withdraw-footer-compose')
      ?.classList.toggle('hide-element', step !== 'compose');

    if (step === 'compose') {
      this.setWithdrawState('review');
    }
  }

  /**
   * @param {'review'|'pending'|'success'|'failed'} state
   */
  setWithdrawState(state) {
    const form = document.getElementById('withdrawal-form');
    if (form) {
      form.dataset.withdrawState = state;
    }

    const onReview = form?.dataset.withdrawStep === 'review';
    const footers = {
      review: document.getElementById('withdraw-footer-review'),
      failed: document.getElementById('withdraw-footer-failed')
    };

    for (const key of Object.keys(footers)) {
      const showFooter = onReview && key === state;
      footers[key]?.classList.toggle('hide-element', !showFooter);
    }

    const spinner = document.getElementById('withdraw-confirm-spinner');
    const iconOk = document.getElementById('withdraw-confirm-icon-success');
    const iconFail = document.getElementById('withdraw-confirm-icon-failure');

    if (spinner) {
      spinner.classList.toggle('show', state === 'pending');
    }
    if (iconOk) {
      iconOk.classList.toggle('hide-element', state !== 'success');
    }
    if (iconFail) {
      iconFail.classList.toggle('hide-element', state !== 'failed');
    }

    this.updateSendResultPresentation(state);
  }

  /**
   * Header + send-result copy for review-step substates (review / pending / success / failed).
   * The DOM step stays #withdraw-step-two; data-withdraw-state drives the sub-view.
   */
  updateSendResultPresentation(state) {
    const overlayTitle = document.getElementById('withdraw-overlay-title');
    const resultPanel = document.getElementById('withdraw-send-result');
    const resultTitle = document.getElementById('withdraw-send-result-title');
    const resultMessage = document.getElementById('withdraw-send-result-message');
    const isResult = state === 'pending' || state === 'success' || state === 'failed';

    resultPanel?.classList.toggle('hide-element', !isResult);

    if (state === 'success') {
      if (overlayTitle) {
        overlayTitle.textContent = 'Payment sent';
      }
      if (resultTitle) {
        resultTitle.textContent = 'Transaction broadcast';
      }
      if (resultMessage) {
        resultMessage.textContent = 'Check transaction history for confirmation.';
      }
    } else if (state === 'failed') {
      if (overlayTitle) {
        overlayTitle.textContent = 'Payment failed';
      }
      if (resultTitle) {
        resultTitle.textContent = 'Transfer unsuccessful';
      }
    } else if (state === 'pending') {
      if (overlayTitle) {
        overlayTitle.textContent = 'Sending…';
      }
      if (resultTitle) {
        resultTitle.textContent = 'Broadcasting Transaction';
      }
      if (resultMessage) {
        resultMessage.textContent = 'Waiting for the network to accept this transfer.';
      }
    } else {
      this.updateHeaderTitle();
      if (resultMessage) {
        resultMessage.textContent = '';
      }
    }
  }

  showReviewStep() {
    this.setWithdrawStep('review');
    this.setWithdrawState('review');
    this.populateReviewDetails();

    const confirmBtn = document.getElementById('withdraw-confirm');
    confirmBtn?.focus();
  }

  populateReviewDetails() {
    this.hideSendResultMessage();
    this.hideTxRow();

    const amountEl = document.getElementById('withdraw-confirm-amount');
    if (amountEl) {
      amountEl.textContent = `${this.getAmountInputDisplayValue()} ${this.ticker}`;
    }

    const addressEl = document.getElementById('withdraw-confirm-address');
    if (addressEl) {
      const showChainAddress = this.address && this.address !== this.publicKey;
      addressEl.classList.toggle('hide-element', !showChainAddress);
      if (showChainAddress) {
        let a = this.address;
        if (a.includes('|')) {
          a = a.split('|')[0];
        }
        addressEl.textContent = a;
      } else {
        addressEl.textContent = '';
      }
    }

    const feeEl = document.getElementById('withdraw-confirm-fee');
    if (feeEl) {
      feeEl.textContent = this.formatFeeDisplay(this.fee);
    }

    const counterpartyWrap = document.getElementById('withdraw-confirm-counterparty');
    if (counterpartyWrap) {
      if (this.publicKey && this.app.crypto.isPublicKey(this.publicKey)) {
        counterpartyWrap.classList.remove('hide-element');
        this.counterparty.publicKey = this.publicKey;
        this.counterparty.render();
        this.counterparty.updateUserline(this.publicKey, this.publicKey);
      } else {
        counterpartyWrap.classList.add('hide-element');
        counterpartyWrap.innerHTML = '';
      }
    }
  }

  async resolveRecipientPublicKey() {
    if (this.isNativeSaitoSelection()) {
      this.publicKey = this.address;
    } else if (typeof this.pc.getSaitoPublicKey === 'function') {
      try {
        const publicKey = await this.pc.getSaitoPublicKey(this.address);
        if (publicKey) {
          this.publicKey = publicKey;
        }
      } catch (err) {
        console.warn('Withdraw: unable to resolve Saito public key for address', err);
      }
    } else if (!this.publicKey) {
      this.publicKey = '';
    }
  }

  getSenderExplorerKey() {
    return this.app.wallet?.publicKey || this.app.wallet?.returnPublicKey?.() || '';
  }

  updateSuccessAction() {
    const action = document.getElementById('withdraw-confirm-tx-explorer');
    if (!action) {
      return;
    }

    if (this.isNativeSaitoSelection()) {
      const key = this.getSenderExplorerKey();
      action.href = key ? `/explorer/address/${encodeURIComponent(key)}` : '/explorer';
    } else {
      action.href = '#';
    }
  }

  async sendWithdrawPayment() {
    try {
      const amount = this.getAmountInputValue();
      const ticker = this.ticker;
      const sender = this.pc.formatAddress();

      this.populateReviewDetails();
      this.setWithdrawStep('review');
      this.setWithdrawState('pending');

      const ts = new Date().getTime();
      await this.app.wallet.sendPayment(
        ticker,
        [sender],
        [this.address],
        [amount],
        btoa(sender + this.address + amount + ts),
        async (res) => {
          if (res?.hash && !res?.err) {
            this.withdrawBroadcastSuccessUi(res.hash);
          } else {
            const errMsg =
              typeof res?.err === 'string'
                ? res.err
                : res?.err?.message
                  ? String(res.err.message)
                  : '';
            this.showError(errMsg);
          }
        },
        this?.publicKey
      );
    } catch (err) {
      console.error('Send Error: ' + err);
      this.showError(err?.message || String(err));
    }
  }

  showComposeStep() {
    this.setWithdrawStep('compose');
    this.setWithdrawState('review');
    this.resetConfirmPresentation();
    document.getElementById('withdraw-input-address')?.focus();
  }

  resetConfirmPresentation() {
    this.hideSendResultMessage();
    this.hideTxRow();
    this.lastTxHash = '';
    const spinner = document.getElementById('withdraw-confirm-spinner');
    spinner?.classList.remove('show');
    document.getElementById('withdraw-confirm-icon-success')?.classList.add('hide-element');
    document.getElementById('withdraw-confirm-icon-failure')?.classList.add('hide-element');
    document.getElementById('withdraw-send-result')?.classList.add('hide-element');
  }

  hideSendResultMessage() {
    const el = document.getElementById('withdraw-send-result-message');
    if (el) {
      el.textContent = '';
    }
  }

  hideTxRow() {
    document.getElementById('withdraw-confirm-tx-row')?.classList.add('hide-element');
    const hashEl = document.getElementById('withdraw-confirm-tx-hash');
    if (hashEl) {
      hashEl.textContent = '';
    }
  }

  showTxRow(hash) {
    if (!hash) {
      return;
    }
    this.lastTxHash = hash;
    const row = document.getElementById('withdraw-confirm-tx-row');
    const hashEl = document.getElementById('withdraw-confirm-tx-hash');
    if (row && hashEl) {
      hashEl.textContent = hash;
      hashEl.setAttribute('title', hash);
      row.classList.remove('hide-element');
    }
  }

  async refreshAvailableBalanceDisplay() {
    const el =
      document.getElementById('withdraw-balance-display') ||
      document.querySelector('.withdraw-info-value.balance');
    if (!this.pc || !el) {
      return;
    }
    const raw = await this.pc.getAvailableBalance();
    if (this.isNftWithdrawSelection()) {
      this._nft_balance_raw = String(raw).trim();
    } else {
      this._nft_balance_raw = null;
    }
    const n = Number(raw);
    this.available_balance = Number.isFinite(n) ? n : 0;
    el.textContent = `${this.app.browser.formatDecimals(String(this.available_balance))} ${this.ticker}`;
    if (document.getElementById('withdraw-input-amount')?.value?.trim()) {
      this.validateAmountInput();
    }
  }

  async loadCryptos() {
    const sel = document.getElementById('withdraw-select-crypto');
    const menu = document.getElementById('withdraw-token-menu');
    if (sel) {
      sel.replaceChildren();
    }
    if (menu) {
      menu.replaceChildren();
    }

    let available_cryptos = this.app.wallet.returnActivatedCryptos();

    for (let crypto_mod of available_cryptos) {
      if (
        !this?.publicKey ||
        (await crypto_mod.returnAddressFromPublicKey(this.publicKey)) !== null
      ) {
        let show_me = crypto_mod.name == this.pc.name;

        let html = `<option ${show_me ? 'selected' : ``} id="crypto-option-${
          crypto_mod.name
        }" value="${crypto_mod.ticker}">${crypto_mod.ticker}</option>`;

        this.app.browser.addElementToId(html, 'withdraw-select-crypto');

        let icons = crypto_mod.returnLogos();

        let img_html = `<img class="crypto-logo hide-element" data-ticker="${crypto_mod.ticker}" src="${icons.img}">`;
        if (icons.sub_logo) {
          img_html += `<img class="chain-logo hide-element" data-ticker="${crypto_mod.ticker}" src="${icons.sub_logo}">`;
        }

        this.app.browser.addElementToId(img_html, 'withdraw-logo-cont');

        if (menu) {
          const li = document.createElement('li');
          li.className = 'withdraw-token-option saito-form-dropdown-option';
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', show_me ? 'true' : 'false');
          li.dataset.ticker = crypto_mod.ticker;
          let sub = '';
          if (icons.sub_logo) {
            sub = `<img class="withdraw-token-option-chain" src="${icons.sub_logo}" alt="" />`;
          }
          li.innerHTML = `<img class="withdraw-token-option-logo" src="${icons.img}" alt="" />${sub}<span class="withdraw-token-option-ticker">${crypto_mod.ticker}</span>`;
          menu.appendChild(li);
        }
      }
    }
    const triggerTick = document.getElementById('withdraw-token-trigger-ticker');
    if (triggerTick) {
      triggerTick.textContent = this.pc.ticker;
    }
  }

  positionTokenMenu() {
    const menu = document.getElementById('withdraw-token-menu');
    const trigger = document.getElementById('withdraw-token-trigger');
    if (!menu || !trigger) {
      return;
    }

    const viewportGap = 8;
    const triggerGap = 2;
    const triggerRect = trigger.getBoundingClientRect();
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
    const preferredMaxHeight = 20 * rootFontSize;
    const desiredHeight = Math.min(preferredMaxHeight, menu.scrollHeight);
    const spaceBelow = window.innerHeight - triggerRect.bottom - viewportGap - triggerGap;
    const spaceAbove = triggerRect.top - viewportGap - triggerGap;
    const openAbove = spaceAbove > spaceBelow && spaceBelow < desiredHeight;
    const availableHeight = Math.max(0, openAbove ? spaceAbove : spaceBelow);
    const menuHeight = Math.min(desiredHeight, availableHeight);
    const menuWidth = Math.min(triggerRect.width, window.innerWidth - 2 * viewportGap);
    const menuLeft = Math.min(
      Math.max(viewportGap, triggerRect.left),
      window.innerWidth - viewportGap - menuWidth
    );

    menu.style.left = `${menuLeft}px`;
    menu.style.top = `${
      openAbove
        ? Math.max(viewportGap, triggerRect.top - triggerGap - menuHeight)
        : triggerRect.bottom + triggerGap
    }px`;
    menu.style.width = `${menuWidth}px`;
    menu.style.maxHeight = `${menuHeight}px`;
  }

  openTokenMenu() {
    const menu = document.getElementById('withdraw-token-menu');
    const trigger = document.getElementById('withdraw-token-trigger');
    if (!menu || !trigger) {
      return;
    }

    menu.classList.remove('hide-element');
    if (typeof menu.showPopover === 'function' && !menu.matches(':popover-open')) {
      menu.showPopover();
    }
    this.positionTokenMenu();
    trigger.setAttribute('aria-expanded', 'true');

    this._closeTokenMenuOnViewportChange ||= () => this.closeTokenMenu();
    this._tokenMenuScrollContainer = trigger.closest('.compose');
    window.addEventListener('resize', this._closeTokenMenuOnViewportChange);
    window.addEventListener('scroll', this._closeTokenMenuOnViewportChange);
    this._tokenMenuScrollContainer?.addEventListener(
      'scroll',
      this._closeTokenMenuOnViewportChange
    );
  }

  closeTokenMenu() {
    const menu = document.getElementById('withdraw-token-menu');
    const trigger = document.getElementById('withdraw-token-trigger');
    if (menu) {
      if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) {
        menu.hidePopover();
      }
      menu.classList.add('hide-element');
    }
    trigger?.setAttribute('aria-expanded', 'false');

    if (this._closeTokenMenuOnViewportChange) {
      window.removeEventListener('resize', this._closeTokenMenuOnViewportChange);
      window.removeEventListener('scroll', this._closeTokenMenuOnViewportChange);
      this._tokenMenuScrollContainer?.removeEventListener(
        'scroll',
        this._closeTokenMenuOnViewportChange
      );
    }
    this._tokenMenuScrollContainer = null;
  }

  focusTokenOption(index) {
    const options = Array.from(document.querySelectorAll('.withdraw-token-option'));
    if (!options.length) {
      return;
    }
    const i = Math.max(0, Math.min(index, options.length - 1));
    options.forEach((el, idx) => el.classList.toggle('withdraw-token-option--focused', idx === i));
    options[i]?.scrollIntoView({ block: 'nearest' });
    this._tokenMenuFocusIndex = i;
  }

  async selectCryptoTicker(ticker) {
    const balEl =
      document.getElementById('withdraw-balance-display') ||
      document.querySelector('.withdraw-info-value.balance');
    if (balEl) {
      balEl.textContent = 'Updating…';
    }
    document
      .querySelectorAll(`#withdraw-logo-cont img`)
      .forEach((el) => el.classList.add('hide-element'));

    document
      .querySelectorAll(`#withdraw-logo-cont img[data-ticker="${ticker}"]`)
      .forEach((el) => el.classList.remove('hide-element'));

    await this.app.wallet.setPreferredCrypto(ticker);
    this.fee = null;

    const sel = document.getElementById('withdraw-select-crypto');
    if (sel) {
      sel.value = ticker;
    }
    const triggerTick = document.getElementById('withdraw-token-trigger-ticker');
    if (triggerTick) {
      triggerTick.textContent = ticker;
    }
    document.querySelectorAll('.withdraw-token-option').forEach((li) => {
      li.setAttribute('aria-selected', li.dataset.ticker === ticker ? 'true' : 'false');
    });

    if (this.publicKey) {
      this.closeTokenMenu();
      this.render();
      return;
    }

    document.querySelector('#withdraw-input-address').value = '';
    document.querySelector('#withdraw-input-amount').value = '';
    this.hideAddressPreview();
    this.resetAmountValidation();
    this.resetErrors();

    this.pc = this.app.wallet.returnPreferredCrypto();
    this.ticker = this.pc.ticker;
    this.address = '';
    this.recipientAddressValid = false;
    this.publicKey = '';
    this.amountErrorMessage = '';

    this.updateHeaderTitle();
    this.updateComposeLabels();

    await this.fetchWithdrawFee();
    await this.refreshAvailableBalanceDisplay();
    this.updateHeaderLogos();

    this.closeTokenMenu();
  }

  async applyAddressInputValue(value) {
    const input = document.getElementById('withdraw-input-address');
    if (!input || input.disabled) {
      return;
    }

    const address = typeof value === 'string' ? value.trim() : '';
    if (!address) {
      return;
    }

    input.focus();
    if (!this.isFixedRecipientForm()) {
      this.publicKey = '';
    }
    input.value = address;
    await this.updateAddressUiFromInput({ showError: true });
  }

  async pasteAddress() {
    try {
      const text = await navigator.clipboard.readText();
      await this.applyAddressInputValue(text);
    } catch (e) {
      console.warn('withdraw paste:', e);
    }
  }

  scanAddress() {
    this.app.connection.emit('scanner-start-scanner', (data) => {
      void this.applyAddressInputValue(data);
    });
  }

  async copyWithFeedback(button, text) {
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      const icon = button?.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-check');
        setTimeout(() => {
          icon.classList.add('fa-copy');
          icon.classList.remove('fa-check');
        }, 800);
      }
    } catch (e) {
      console.warn('withdraw copy:', e);
    }
  }

  async attachEvents() {
    let this_withdraw = this;
    this._tokenMenuFocusIndex = -1;

    const trigger = document.getElementById('withdraw-token-trigger');
    const menu = document.getElementById('withdraw-token-menu');
    if (trigger && menu) {
      trigger.onclick = (e) => {
        e.stopPropagation();
        const open = menu.classList.contains('hide-element');
        if (open) {
          this.openTokenMenu();
          const currentIdx = Array.from(menu.querySelectorAll('.withdraw-token-option')).findIndex(
            (li) => li.dataset.ticker === this.ticker
          );
          this.focusTokenOption(currentIdx >= 0 ? currentIdx : 0);
          setTimeout(() => {
            document.addEventListener(
              'click',
              (ev) => {
                if (ev.target.closest('#withdraw-token-custom')) {
                  return;
                }
                this.closeTokenMenu();
              },
              { once: true }
            );
          }, 0);
        } else {
          this.closeTokenMenu();
        }
      };

      trigger.onkeydown = (e) => {
        const open = !menu.classList.contains('hide-element');
        if (e.key === 'Escape') {
          this.closeTokenMenu();
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!open) {
            this.openTokenMenu();
          }
          const options = Array.from(menu.querySelectorAll('.withdraw-token-option'));
          let idx = this._tokenMenuFocusIndex;
          if (idx < 0) {
            idx = options.findIndex((li) => li.dataset.ticker === this.ticker);
          }
          idx += e.key === 'ArrowDown' ? 1 : -1;
          this.focusTokenOption(idx);
        }
        if (e.key === 'Enter' && open) {
          e.preventDefault();
          const focused = menu.querySelector('.withdraw-token-option--focused');
          const ticker = focused?.dataset?.ticker;
          if (ticker && ticker !== this.ticker) {
            void this.selectCryptoTicker(ticker);
          } else {
            this.closeTokenMenu();
          }
        }
      };

      menu.onclick = (e) => {
        const li = e.target.closest('.withdraw-token-option');
        if (!li || !li.dataset.ticker) {
          return;
        }
        e.stopPropagation();
        if (li.dataset.ticker !== this.ticker) {
          void this.selectCryptoTicker(li.dataset.ticker);
        }
      };
    }

    const addrInput = document.querySelector('#withdraw-input-address');
    if (addrInput) {
      const clearAddressUi = () => {
        this.clearAddressError();
        this.handleErrors();
      };
      addrInput.onfocus = clearAddressUi;
      addrInput.oninput = () => {
        if (!this.isFixedRecipientForm()) {
          this.publicKey = '';
        }
        clearAddressUi();
        void this.updateAddressUiFromInput();
      };
      addrInput.onblur = async () => {
        await this.updateAddressUiFromInput({ showError: true });
      };
    }

    const amtInput = document.querySelector('#withdraw-input-amount');
    if (amtInput) {
      amtInput.onfocus = () => {
        this.updateAmountActionState();
      };
      amtInput.oninput = () => {
        this.normalizeAmountInput();
        this.validateAmountInput();
      };
      amtInput.onpaste = () => {
        setTimeout(() => {
          this.normalizeAmountInput({ strictLocaleSeparators: false });
          this.validateAmountInput();
        }, 0);
      };
      amtInput.onblur = () => {
        this.normalizeAmountInput();
        this.updateAmountActionState();
        this.validateAmountInput();
      };

      amtInput.onchange = () => {
        this.normalizeAmountInput();
        this.validateAmountInput();
      };
    }

    const pasteBtn = document.getElementById('withdraw-paste-btn');
    if (pasteBtn) {
      pasteBtn.onmousedown = (e) => {
        e.preventDefault();
      };
      pasteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.pasteAddress();
      };
    }

    const scanBtn = document.getElementById('withdraw-qr-scan-btn');
    if (scanBtn) {
      scanBtn.onmousedown = (e) => {
        e.preventDefault();
      };
      scanBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.scanAddress();
      };
    }

    const feeWrap = document.getElementById('withdraw-fee-wrap');
    if (feeWrap) {
      feeWrap.onclick = (e) => {
        e.preventDefault();
        void this.promptForFee();
      };
    }

    const txCopyBtn = document.getElementById('withdraw-confirm-tx-copy');
    if (txCopyBtn) {
      const copyTxHash = () => {
        void this.copyWithFeedback(txCopyBtn, this.lastTxHash);
      };
      txCopyBtn.onclick = copyTxHash;
      txCopyBtn.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          copyTxHash();
        }
      };
    }

    const editBtn = document.getElementById('withdraw-edit');
    if (editBtn) {
      editBtn.onclick = (e) => {
        e.preventDefault();
        this.showComposeStep();
      };
    }

    const tryEditBtn = document.getElementById('withdraw-try-edit');
    if (tryEditBtn) {
      tryEditBtn.onclick = (e) => {
        e.preventDefault();
        this.showComposeStep();
      };
    }

    const tryAgainBtn = document.getElementById('withdraw-try-again');
    if (tryAgainBtn) {
      tryAgainBtn.onclick = (e) => {
        e.preventDefault();
        this.resetConfirmPresentation();
        this.setWithdrawState('review');
        void document.getElementById('withdraw-confirm')?.click();
      };
    }

    const explorerLink = document.getElementById('withdraw-confirm-tx-explorer');
    if (explorerLink) {
      explorerLink.onclick = (e) => {
        if (!this.isNativeSaitoSelection()) {
          e.preventDefault();
          this.overlay.close();
          this.app.connection.emit('saito-crypto-wallet-history-render-request', {
            ticker: this.ticker
          });
          return;
        }
        this.overlay.close();
      };
    }

    const form = document.querySelector('#withdrawal-form');
    if (form != null) {
      form.onsubmit = async (e) => {
        e.preventDefault();

        const hasValidRecipient = await this.updateAddressUiFromInput({ showError: true });
        this.validateAmountInput();
        await this.resolveRecipientPublicKey();

        if (
          !hasValidRecipient ||
          !this.recipientAddressValid ||
          this.errors['amount'] != false ||
          this.errors['address'] != false
        ) {
          return false;
        }

        if (this.feePending) {
          return false;
        }

        await this.sendWithdrawPayment();
      };

      const confirmBtn = document.getElementById('withdraw-confirm');
      if (confirmBtn) {
        confirmBtn.onclick = async (e) => {
          e.preventDefault();
          await this.sendWithdrawPayment();
        };
      }

      const maxBtn = document.getElementById('withdraw-max-btn');
      if (maxBtn != null) {
        maxBtn.onclick = async (e) => {
          e.preventDefault();
          if (!document.querySelector('#withdraw-input-amount').disabled) {
            await this_withdraw.refreshAvailableBalanceDisplay();
            if (this_withdraw.isNftWithdrawSelection()) {
              this_withdraw.setAmountInputValue(
                this_withdraw._nft_balance_raw != null
                  ? this_withdraw._nft_balance_raw
                  : this_withdraw.available_balance
              );
            } else {
              const fee = Number(this_withdraw.fee) || 0;
              this_withdraw.setAmountInputValue(this_withdraw.available_balance - fee);
            }
            this_withdraw.validateAmountInput();
            this_withdraw.updateAmountActionState();
          }
        };
      }

      if (document.getElementById('address-book')) {
        document.getElementById('address-book').onclick = (e) => {
          this.contacts.title = `Contacts with ${this.ticker}`;
          this.contacts.callback = async (key) => {
            this.publicKey = key;
            const input = document.getElementById('withdraw-input-address');
            if (input) {
              let address = key;
              if (
                !this.isNativeSaitoSelection() &&
                typeof this.pc.returnAddressFromPublicKey === 'function'
              ) {
                address = await this.pc.returnAddressFromPublicKey(key);
              }
              input.disabled = false;
              input.value = address || '';
            }
            await this.updateAddressUiFromInput({ showError: true });
            this.clearAddressError();
            this.handleErrors();
          };

          let contactsWithCrypto = this.app.keychain.returnKeys();

          if (this.ticker !== 'SAITO') {
            contactsWithCrypto = contactsWithCrypto.filter(
              (k) => k?.crypto_addresses && k.crypto_addresses[this.ticker]
            );
          }

          contactsWithCrypto = contactsWithCrypto.map((x) => x.publicKey);

          this.contacts.render(contactsWithCrypto);
        };
      }

      document
        .querySelectorAll('.saito-crypto-withdraw .withdraw-options-cont[role="button"]')
        .forEach((control) => {
          control.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              control.click();
            }
          };
        });
    }
  }

  showError(detail = '') {
    const msgEl = document.getElementById('withdraw-send-result-message');
    if (msgEl) {
      msgEl.textContent = detail ? String(detail) : 'Please try again.';
    }
    this.setWithdrawState('failed');
    this.hideTxRow();
  }

  withdrawBroadcastSuccessUi(hash = '') {
    this.updateSuccessAction();
    this.setWithdrawState('success');

    if (hash && this.pc?.chain_id === 'NATIVE') {
      this.showTxRow(hash);
    } else {
      this.hideTxRow();
    }
  }

  hideSaitoHeaderMenu() {
    let components = this.mod.components;
    for (let key in components) {
      if (components[key]?.slug == 'SaitoHeader') {
        let saito_header = components[key];
        saito_header.hideMenu();
      }
    }
  }

  updateFeeEditability() {
    const wrap = document.getElementById('withdraw-fee-wrap');
    const isNative = this.pc?.chain_id === 'NATIVE';
    wrap?.classList.toggle('fee-wrap--editable', isNative);
    if (wrap) {
      wrap.title = isNative ? 'Click to set the network fee' : '';
    }
  }

  async promptForFee() {
    if (!this.pc || this.pc.chain_id !== 'NATIVE') {
      return;
    }

    const current = this.getNativeDefaultFee().toString();
    const input = await sprompt('Set network fee (SAITO):', current);
    if (input === false || input === undefined || input === '') {
      return;
    }

    const parsed = parseFloat(input);
    if (!Number.isFinite(parsed) || parsed < 0) {
      siteMessage('Please enter a valid, non-negative fee.', 2000);
      return;
    }

    this.app.options.wallet = this.app.options.wallet || {};
    this.app.options.wallet.default_fee = this.app.wallet.convertSaitoToNolan(parsed.toString());
    this.app.wallet.default_fee = BigInt(this.app.options.wallet.default_fee);
    this.app.storage.saveOptions();

    siteMessage(`Network fee updated to: ${parsed} SAITO`, 1000);

    // Native-chain fee is a flat wallet setting, not dependent on the recipient
    // address, so reflect it immediately rather than waiting on fetchWithdrawFee's
    // address-gated lookup (which shows "--" until a valid address is entered).
    this.fee = parsed;
    const feeEl =
      document.getElementById('withdraw-fee-display') ||
      document.querySelector('.withdraw-info-value.fee');
    this.setFeeDisplayElement(feeEl, this.formatFeeDisplay(parsed));

    this.handleErrors();
    this.validateAmountInput();
  }

  async fetchWithdrawFee() {
    const feeEl =
      document.getElementById('withdraw-fee-display') ||
      document.querySelector('.withdraw-info-value.fee');
    this.updateFeeEditability();
    if (!feeEl) {
      return;
    }

    if (this.pc?.chain_id === 'NATIVE') {
      this.feeRequestKey = '';
      this.feeRequestPromise = null;
      this.fee = this.getNativeDefaultFee();
      this.feePending = false;
      this.setFeeDisplayElement(feeEl, this.formatFeeDisplay(this.fee));
      this.validateAmountInput();
      return;
    }

    const address = document.getElementById('withdraw-input-address')?.value?.trim() || '';

    if (!address) {
      this.feeRequestKey = '';
      this.feeRequestPromise = null;
      this.fee = null;
      this.feePending = false;
      this.setFeeDisplayElement(feeEl, '—', 'Add a recipient address to estimate the network fee');
      this.handleErrors();
      return;
    }

    if (!this.pc?.validateAddress(address)) {
      this.feeRequestKey = '';
      this.feeRequestPromise = null;
      this.fee = null;
      this.feePending = false;
      this.setFeeDisplayElement(feeEl, '—');
      this.handleErrors();
      return;
    }

    const cryptoModule = this.pc;
    const requestKey = `${cryptoModule.ticker}:${address}`;

    if (this.feeRequestKey === requestKey && this.feeRequestPromise) {
      await this.feeRequestPromise;
      return;
    }

    this.address = address;
    this.feePending = true;
    this.feeRequestKey = requestKey;
    this.setFeeDisplayElement(feeEl, '…');
    this.handleErrors();

    let feeReceived = false;
    const feeRequestPromise = (async () => {
      try {
        await cryptoModule.checkWithdrawalFeeForAddress(address, (amt) => {
          feeReceived = true;

          if (this.feeRequestKey !== requestKey || this.pc !== cryptoModule) {
            return;
          }

          this.fee = Number(amt);
          this.feePending = false;
          this.setFeeDisplayElement(feeEl, this.formatFeeDisplay(amt));
          this.validateAmountInput();
        });

        if (!feeReceived && this.feeRequestKey === requestKey && this.pc === cryptoModule) {
          this.fee = null;
          this.feePending = false;
          this.setFeeDisplayElement(feeEl, '—', 'Unable to estimate the network fee');
          this.handleErrors();
        }
      } catch (err) {
        if (this.feeRequestKey === requestKey && this.pc === cryptoModule) {
          this.fee = null;
          this.feePending = false;
          this.setFeeDisplayElement(feeEl, '—', 'Unable to estimate the network fee');
          this.handleErrors();
        }
        console.error('Withdraw: unable to estimate network fee', err);
      }
    })();

    this.feeRequestPromise = feeRequestPromise;
    await feeRequestPromise;

    if (this.feeRequestPromise === feeRequestPromise) {
      this.feeRequestKey = '';
      this.feeRequestPromise = null;
    }
  }

  validateAmountInput() {
    this.clearAmountError();

    const input = document.getElementById('withdraw-input-amount');
    const hasInput = Boolean(input?.value?.trim());
    let amount = this.getAmountInputValue();
    let error_msg = null;

    if (!hasInput) {
      this.updateAmountActionState();
      this.handleErrors();
      return;
    }

    if (amount != '') {
      if (this.isNftWithdrawSelection()) {
        const amtStr = String(amount).trim();
        try {
          const want = BigInt(amtStr);
          const avail =
            this._nft_balance_raw != null && this._nft_balance_raw !== ''
              ? BigInt(this._nft_balance_raw)
              : BigInt(Math.floor(Number(this.available_balance) || 0));
          if (want <= 0n) {
            error_msg = 'Amount must be greater than 0';
          } else if (want > avail) {
            error_msg = `Insufficient NFT units (${avail.toString()} ${this.ticker} available)`;
          }
        } catch (e) {
          error_msg = 'Enter a whole number of NFT units';
        }
      } else {
        amount = Number(amount);

        let amount_avl = this.available_balance;
        this.fee = Number(this.fee);

        if (amount <= 0) {
          error_msg = 'Amount must be greater than 0';
        } else if (amount > amount_avl) {
          error_msg = `Insufficient funds (${amount_avl} ${this.ticker} available)`;
        } else if (Number.isFinite(this.fee) && amount + this.fee > amount_avl) {
          error_msg = 'The amount plus the network fee exceeds your available balance';
        }
      }
    } else {
      error_msg = 'Enter a valid amount';
    }

    if (error_msg) {
      this.errors['amount'] = true;
      this.amountErrorMessage = error_msg;
    }

    this.updateAmountActionState();
    this.handleErrors();
  }

  validateAddressInput() {
    this.clearAddressError();

    this.address = document.querySelector('#withdraw-input-address')?.value?.trim() || '';

    let valid = this.pc.validateAddress(this.address);
    this.recipientAddressValid = valid;

    if (!valid) {
      this.errors['address'] = true;
      this.address = '';
      this.renderInvalidRecipientPreview();
      this.showAddressPreview();
    }

    this.handleErrors();
  }

  handleErrors() {
    const submit = document.querySelector('#saito-overlay-submit');
    if (!submit) {
      return;
    }
    const blocked =
      this.errors['amount'] != false ||
      this.errors['address'] != false ||
      this.feePending ||
      !this.recipientAddressValid ||
      !this.hasAmountInputValue();
    if (blocked) {
      if (!submit.getAttribute('disabled')) {
        submit.setAttribute('disabled', true);
      }
    } else {
      submit.removeAttribute('disabled');
    }
  }

  clearAddressError() {
    this.errors['address'] = false;
  }

  clearAmountError() {
    this.errors['amount'] = false;
    this.amountErrorMessage = '';
  }

  resetErrors() {
    this.errors = {
      amount: false,
      address: false
    };
    this.clearAddressError();
    this.clearAmountError();
    this.recipientAddressValid = false;

    this.handleErrors();
  }

  isNftWithdrawSelection() {
    return this.pc?.categories === 'NFT' && typeof this.pc?.nft_id === 'string' && this.pc.nft_id;
  }

  clear() {
    this.closeTokenMenu();
    this.resetErrors();
    this.ticker = null;
    this.pc = null;
    this.publicKey = '';
    this.fixedRecipient = false;
    this.address = '';
    this.recipientAddressValid = false;
    this.fee = null;
    this.feePending = false;
    this.feeRequestKey = '';
    this.feeRequestPromise = null;
    this.lastTxHash = '';
    this.available_balance = 0;
    this._nft_balance_raw = null;
    this.amountErrorMessage = '';
  }
}

module.exports = Withdraw;
