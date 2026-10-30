const SaitoPurchaseTemplate = require('./buysaito-purchase.template');
const SaitoPurchaseCompleteTemplate = require('./buysaito-complete.template');
const SaitoPurchaseLoaderTemplate = require('./buysaito-loader.template');
const SaitoPurchaseErrorTemplate = require('./buysaito-error.template');
const SaitoPurchaseCryptoTemplate = require('./buysaito-select-crypto.template');
const SaitoPurchaseAmountTemplate = require('./buysaito-amount.template');
const SaitoPurchaseFaucetAuthTemplate = require('./buysaito-faucet-auth.template');

const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class SaitoPurchaseOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    this.overlay = new SaitoOverlay(app, mod, true, true);
    this.session = 0;

    //
    // init
    //
    this.amount = 0;
    this.expected_deposit = 0;
    this.amount_input_source = 'crypto';
    this.crypto_selected = false;
    this.tx = null;
    this.recipient = '';
    this.description = '';
    this.payment_detected = false;
    this.internal_payment_pending = false;
    this.internal_payment_sending = false;
    this.reservation = null;
    this.saito_issuance = null;
    this.saito_receipts = new Map();
    this.reserved_until = 0;
    this.fancy_ui = true;
    this.active = false;

    this.acquisition_stage = 'default';
    this.acquisition_options = [];
    this.stage1_html = null;
    this.stage1_footer_html = null;
    this.faucet_already_issued = null;

    this.reservation_timer = null;
    this.payment_instruction_timer = null;
    this.saito_arrival_timer = null;
    this.saito_arrival_baseline = null;
    this.saito_arrival_expected = null;

    this.ui_msg = '';

    /**
     * Events (in reverse order):
     * 4. Confirm saito issued/TX sent
     * 3. Confirm Pending Depost
     * 2. Get deposit address
     * 1. Launch overlay
     */

    app.connection.on('saito-purchase-saito-issued', async (data) => {
      this.updateSaitoIssued(data);
    });

    app.connection.on('on-payment-received', (data) => {
      this.receiveSaitoPayment(data);
    });

    app.connection.on('saito-purchase-payment-detected', (data) => {
      this.receivePaymentDetected(data);
    });

    app.connection.on('saito-purchase-address-reserved', (data) => {
      this.receivePaymentAddressFromServer(data);
    });

    app.connection.on('saito-purchase-error-notification', (data = {}) => {
      if (!this.active) return;
      if (data?.code === 'insufficient_funds') {
        if (
          !this.reservation ||
          data.id !== this.reservation.id ||
          data.ticker !== this.reservation.ticker ||
          data.address !== this.reservation.address
        )
          return;
        this.clearPaymentInstructionTimer();
        this.clearReservationTimer();
        // Keep the purchase session so a later payout can complete this overlay.
        this.showOverlay(SaitoPurchaseErrorTemplate('', data.code));
        return;
      }
      // An unclassified issuance error is not evidence that a refill is needed.
      if (!data?.message) return;
      this.clearPaymentInstructionTimer();
      this.clearReservationTimer();
      this.stopSaitoArrivalWatch();
      this.reservation = null;
      this.overlay.close();
      this.showOverlay(SaitoPurchaseErrorTemplate(data?.message));
    });

    app.connection.on(
      'saito-purchase-launch',
      (amount, recipient = '', tx = null, description = '') => {
        this.reset();
        this.active = true;
        this.app.connection.emit('saito-purchase-overlay-open', () => {
          this.close();
        });
        this.amount = Number(amount);
        this.description = description;
        this.recipient = recipient || this.mod.publicKey;
        this.tx = tx;

        if (this.mod.available_currencies?.length == 0) {
          if (!this.mod.buysaito_peer?.publicKey) {
            this.mod.available_currencies = null;
            this.render();
            return;
          }
          this.showOverlay(SaitoPurchaseLoaderTemplate('Checking availability...'));
          this.app.network.sendRequestAsTransaction(
            'buysaito available currencies',
            null,
            (response) => this.mod.receiveAvailableCurrencies(response),
            this.mod.buysaito_peer.publicKey
          );

          this.timer = setTimeout(() => {
            if (!this.active) {
              return;
            }
            this.mod.available_currencies = null;
            this.render();
          }, 5000);

          return;
        }

        if (!amount) {
          this.fancy_ui = false;
        }

        if (this.fancy_ui) {
          // More complicated but smoother transition while fetching info
          this.showOverlay(SaitoPurchaseLoaderTemplate('Checking availability...'));
          this.timer = setTimeout(() => {
            if (!this.active) {
              return;
            }
            this.render();
          }, 1000);
          this.fancy_ui = false;
        } else {
          this.render();
        }
      }
    );

    app.connection.on('saito-purchase-cryptos', () => {
      if (!this.active || this.crypto_selected) {
        return;
      }
      console.log('saito-purchase-cryptos', this.mod.available_currencies);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.active) {
          return;
        }
        this.fancy_ui = false;
        this.render();
      }, 1000);
    });
  }

  async render() {
    let self = this;
    const resumeStage =
      this.acquisition_stage && this.acquisition_stage !== 'default' ? this.acquisition_stage : '';

    console.debug(
      'SaitoPurchaseOverlay Rendering...',
      this.amount,
      this.description,
      this.crypto_selected,
      this.tx
    );

    if (!this.mod.available_currencies) {
      this.overlay.remove();
      salert('Service currently not available');
      return;
    }

    // Reuse this overlay's layer while advancing the purchase flow. Recreating
    // it would move Get Saito above optional overlays opened in response to it.

    if (!this.crypto_selected) {
      //
      // 1. user selects crypto
      //
      this.showOverlay(SaitoPurchaseCryptoTemplate(this.app, this.mod, this));
    } else {
      if (!this.address) {
        // 1.5 alternate amount selection
        if (!this.amount) {
          this.showOverlay(SaitoPurchaseAmountTemplate(this.app, this.mod, this));
        } else {
          //
          // 2. show loading screen after selecting crypto ticker
          //
          this.showOverlay(SaitoPurchaseLoaderTemplate(this.ui_msg, ''));
        }
      } else {
        //
        // 3. Show address screen when deposit address is created/fetched
        //
        if (!this.payment_detected && !this.internal_payment_sending) {
          this.showOverlay(SaitoPurchaseTemplate(this.app, this.mod, this));
          this.overlay.blockClose();
          this.app.browser.generateQRCode(this.address, 'pqrcode');
        } else {
          //
          // 4. Wait for detection of an internal transfer or issuance of SAITO.
          //
          this.showOverlay(SaitoPurchaseLoaderTemplate(this.ui_msg));
          this.overlay.blockClose();
        }
      }
    }

    // Populate optional acquisition entries from current module state whenever
    // the Stage 1 shell is built. Availability may have arrived before the
    // overlay existed.
    if (!this.crypto_selected) {
      this.renderAcquisitionOptions();
    }

    this.attachEvents();

    // Resume faucet-auth (etc.) after Stage 1 shell was rebuilt.
    if (resumeStage && document.getElementById('buysaito-stage')) {
      const resumeOpt =
        this.acquisition_options.find((opt) => opt.inline_stage === resumeStage) || null;
      this.enterAcquisitionStage(resumeStage, resumeOpt);
    }
  }

  /**
   * Collect optional acquisition entries from other modules
   * (e.g. Faucet via respondTo('buysaito-options')) and render them
   * into `.buysaito-options` above purchase methods / fallback info.
   *
   * Options may declare `inline_stage` to transition this overlay's
   * lower `#buysaito-stage` in place instead of opening another overlay.
   */
  renderAcquisitionOptions() {
    const container = document.querySelector('#purchase-container .buysaito-options');
    if (!container) {
      return;
    }

    const options = (this.app.modules.getRespondTos('buysaito-options') || [])
      .filter(
        (opt) =>
          opt && (opt.title || opt.text) && (typeof opt.callback === 'function' || opt.inline_stage)
      )
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));

    this.acquisition_options = options;

    if (!options.length) {
      container.innerHTML = '';
      this.updatePurchaseMethodHeading(false);
      return;
    }

    if (this.faucet_already_issued) {
      const dailyLimit = this.faucet_already_issued.daily_limit === true;
      const noticeTitle = dailyLimit
        ? 'Daily faucet allocation already received'
        : 'Faucet allocation already received';
      const noticeDescription = dailyLimit
        ? 'This Saito public key has used the network faucet in the last 24 hours. You can request another allocation after the cooldown, continue with the purchase options below, or return to your previous action.'
        : 'This Saito public key has already received its one-time SAITO allocation from the network faucet. You can continue with purchase options below, or close this window and return to your previous action.';
      container.innerHTML = `
      <div class="buysaito-option buysaito-option-faucet-issued" role="status">
        <div class="buysaito-option-icon">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
        </div>
        <div class="buysaito-option-copy">
          <div class="buysaito-option-title">${noticeTitle}</div>
          <div class="buysaito-option-description">
            ${noticeDescription}
          </div>
        </div>
      </div>
    `;
      // Issued notice replaces the green Faucet card — use the default payment heading.
      this.updatePurchaseMethodHeading(false);
      return;
    }

    container.innerHTML = options
      .map((opt, index) => {
        const title = opt.title || opt.text || '';
        const description = opt.description || '';
        const icon = opt.icon || '';
        const iconHtml = icon ? `<i class="${icon}" aria-hidden="true"></i>` : '';
        const optionClass = [
          'buysaito-option',
          opt.option_class || '',
          opt.id === 'faucet' ? 'buysaito-option-faucet' : ''
        ]
          .filter(Boolean)
          .join(' ');
        const optionId = opt.id ? ` data-buysaito-option-id="${opt.id}"` : '';
        return `
            <button type="button" class="${optionClass}" data-buysaito-option="${index}"${optionId}>
              <div class="buysaito-option-icon">${iconHtml}</div>
              <div class="buysaito-option-copy">
                <div class="buysaito-option-title">${title}</div>
                ${description ? `<div class="buysaito-option-description">${description}</div>` : ''}
              </div>
            </button>
          `;
      })
      .join('');

    const showFaucetOption = options.some((opt) => opt.id === 'faucet');
    this.updatePurchaseMethodHeading(showFaucetOption);

    container.querySelectorAll('[data-buysaito-option]').forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        const index = parseInt(el.getAttribute('data-buysaito-option'), 10);
        const opt = this.acquisition_options?.[index];
        if (!opt) {
          return;
        }

        // Prefer in-overlay stage transition (Faucet auth, future claim states).
        if (opt.inline_stage) {
          this.enterAcquisitionStage(opt.inline_stage, opt);
          return;
        }

        if (typeof opt.callback === 'function') {
          opt.callback(this.app, this.mod, this);
        }
      };
    });
  }

  /**
   * Stage 1 crypto-list heading: default "CHOOSE PAYMENT METHOD", or
   * "OR PURCHASE DIRECTLY" when the green Faucet option card is present.
   */
  updatePurchaseMethodHeading(showFaucetOption = false) {
    const purchaseContainer = document.getElementById('purchase-container');
    const msg = document.querySelector('#buysaito-stage .purchase-select-crypto-msg');

    purchaseContainer?.classList.toggle('has-faucet-option', !!showFaucetOption);

    if (msg) {
      msg.textContent = showFaucetOption ? 'OR PURCHASE DIRECTLY' : 'CHOOSE PAYMENT METHOD';
    }
  }

  /**
   * Replace the green Faucet intro card with a neutral/orange notice that the
   * public key is not currently eligible for another faucet allocation.
   * Keeps Get SAITO open; does not open the Faucet claim overlay.
   */
  showFaucetAlreadyIssuedNotice(details = {}) {
    this.faucet_already_issued = details && typeof details === 'object' ? details : {};

    // Restore Stage 1 purchase/fallback content under the notice.
    if (this.acquisition_stage !== 'default' && this.stage1_html != null) {
      const stageEl = document.getElementById('buysaito-stage');
      if (stageEl) {
        stageEl.innerHTML = this.stage1_html;
      }
      this.acquisition_stage = 'default';
      this.stage1_html = null;
    }

    const footer = document.querySelector('#purchase-container .buysaito-footer-note');
    if (footer && this.stage1_footer_html != null) {
      footer.classList.remove('buysaito-footer-nav');
      footer.innerHTML = this.stage1_footer_html;
      this.stage1_footer_html = null;
    }
    document.getElementById('purchase-container')?.classList.remove('buysaito-stage-faucet-auth');

    this.attachEvents();
  }

  /**
   * True when the Get SAITO purchase overlay is currently visible.
   */
  isPurchaseOverlayOpen() {
    return !!(this.active && this.overlay && document.querySelector('#purchase-container'));
  }

  /**
   * Replace only `#buysaito-stage` content. Keeps the GET SAITO shell,
   * options strip (Faucet card), separator, and overlay geometry intact.
   */
  enterAcquisitionStage(stage = '', opt = null) {
    const stageEl = document.getElementById('buysaito-stage');
    if (!stageEl || !stage) {
      return;
    }

    if (this.acquisition_stage === 'default') {
      this.stage1_html = stageEl.innerHTML;
    }

    this.acquisition_stage = stage;

    if (stage === 'faucet-auth') {
      const providers =
        Array.isArray(opt?.providers) && opt.providers.length
          ? opt.providers
          : this.defaultFaucetAuthProviders();
      stageEl.innerHTML = SaitoPurchaseFaucetAuthTemplate(providers, opt?.auth_message);
      document.getElementById('purchase-container')?.classList.add('buysaito-stage-faucet-auth');

      // Host back-nav in the same footer slot as the migration note (main-screen height/rhythm).
      const footer = document.querySelector('#purchase-container .buysaito-footer-note');
      if (footer) {
        this.stage1_footer_html = footer.innerHTML;
        footer.classList.add('buysaito-footer-nav');
        footer.innerHTML = `
          <button type="button" class="saito-button-square" data-buysaito-stage-back aria-label="Return to purchase options">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <button type="button" class="buysaito-stage-nav-label" data-buysaito-stage-back>
            Return to purchase options
          </button>
        `;
      }

      this.attachFaucetAuthStageEvents(opt);
      return;
    }

    console.warn('BuySaito: unknown acquisition stage', stage);
  }

  defaultFaucetAuthProviders() {
    return [
      { id: 'twitter', name: 'X', icon: 'fa-brands fa-x-twitter' },
      { id: 'github', name: 'GitHub', icon: 'fa-brands fa-github' }
    ];
  }

  attachFaucetAuthStageEvents(opt = null) {
    const root = document.getElementById('purchase-container');
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-buysaito-auth-provider]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const providerId = btn.getAttribute('data-buysaito-auth-provider');
        if (typeof opt?.beginProviderAuth === 'function') {
          opt.beginProviderAuth(providerId);
          return;
        }
        const faucet = this.app.modules.returnModule('Faucet');
        if (faucet && typeof faucet.beginProviderAuthentication === 'function') {
          faucet.beginProviderAuthentication(providerId);
        }
      };
    });

    root.querySelectorAll('[data-buysaito-stage-back]').forEach((back) => {
      back.onclick = (e) => {
        e.preventDefault();
        this.exitAcquisitionStage();
      };
    });
  }

  /**
   * Restore the Stage 1 lower-section HTML captured before the Faucet
   * transition. Does not close or rebuild the overlay.
   */
  exitAcquisitionStage() {
    const stageEl = document.getElementById('buysaito-stage');
    document.getElementById('purchase-container')?.classList.remove('buysaito-stage-faucet-auth');

    const footer = document.querySelector('#purchase-container .buysaito-footer-note');
    if (footer && this.stage1_footer_html != null) {
      footer.classList.remove('buysaito-footer-nav');
      footer.innerHTML = this.stage1_footer_html;
      this.stage1_footer_html = null;
    }

    if (!stageEl || this.stage1_html == null) {
      this.acquisition_stage = 'default';
      this.stage1_html = null;
      return;
    }

    stageEl.innerHTML = this.stage1_html;
    this.acquisition_stage = 'default';
    this.stage1_html = null;

    // Rebind Stage 1 interactions (crypto select, etc.) without re-showing overlay.
    this.attachEvents();
  }

  attachEvents() {
    const walletPaymentButton = document.getElementById('pay-from-wallet-btn');
    if (walletPaymentButton) {
      const reservation = this.reservation;
      walletPaymentButton.onclick = () => this.payFromWallet(reservation);
    }

    //////////////////////
    // Select Crypto Form
    /////////////////////
    document.querySelectorAll('.purchase-crypto-item').forEach((el) => {
      el.onclick = async (e) => {
        for (let i = 0; i < this.mod.available_currencies.length; i++) {
          if (this.mod.available_currencies[i].ticker == e.currentTarget.id) {
            this.crypto_selected = this.mod.available_currencies[i];
          }
        }
        if (!this.crypto_selected) {
          salert('Error reading crypto selection');
          return;
        }

        console.log(this.crypto_selected);
        const session = this.session;
        const currency = this.crypto_selected;
        await this.checkForLocalCrypto();
        if (!this.active || this.session !== session || this.crypto_selected !== currency) return;

        if (this.amount) {
          this.showOverlay(SaitoPurchaseLoaderTemplate('Requesting Payment Instructions...'));
          this.requestPaymentAddressFromServer();
        } else {
          this.render();
        }
      };
    });

    this.attachAmountEvents();

    ///////////////////
    // Deposit form
    ///////////////////
    if (document.querySelector('.buysaito-payment-box .pubkey-container')) {
      document.querySelector('.buysaito-payment-box .pubkey-container').onclick = (e) => {
        navigator.clipboard.writeText(this.address);
        let icon_element = document.querySelector('.buysaito-payment-box .pubkey-container i');
        icon_element.classList.toggle('fa-copy');
        icon_element.classList.toggle('fa-check');
        setTimeout(() => {
          icon_element.classList.toggle('fa-copy');
          icon_element.classList.toggle('fa-check');
        }, 800);
      };
    }
  }

  renderAmountPage() {
    const root = document.getElementById('buysaito-amount-form');
    if (!root) return;

    const state = this.page_amount_selection || { amount_input_source: 'crypto' };
    const sourceId = state.amount_input_source === 'saito' ? 'saito-input-amount' : 'input-amount';
    const value = root.querySelector(`#buy-page-${sourceId}`)?.value || '';
    state.crypto_selected =
      this.mod.available_currencies?.find(
        (currency) => currency.ticker === state.crypto_selected?.ticker
      ) || this.mod.available_currencies?.[0];
    this.page_amount_selection = state;
    root.innerHTML = SaitoPurchaseAmountTemplate(this.app, this.mod, state, { inline: true });
    this.attachAmountEvents({ root, state, prefix: 'buy-page-', inline: true });
    const source = root.querySelector(`#buy-page-${sourceId}`);
    source.value = value;
    source.oninput();
  }

  attachAmountEvents({ root = document, state = this, prefix = '', inline = false } = {}) {
    const get = (id) =>
      root === document ? document.getElementById(id) : root.querySelector(`#${prefix}${id}`);
    const cryptoInput = get('input-amount');
    const saitoInput = get('saito-input-amount');
    const nextButton = get('next-purchase-btn');
    const currencySelect = get('payment-currency');
    if (!cryptoInput || !saitoInput || !nextButton) return;

    const updateNext = () => {
      nextButton.disabled =
        !state.crypto_selected ||
        !this.isValidAmount(cryptoInput.value) ||
        !this.isValidAmount(saitoInput.value);
    };
    const updateAmount = (sourceInput, targetInput, source) => {
      sourceInput.value = this.sanitizeAmountInput(sourceInput.value);
      state.amount_input_source = source;
      const ticker = state.crypto_selected?.ticker;
      const converted =
        ticker && sourceInput.value
          ? source === 'saito'
            ? this.mod.convertSaitoToOther(Number(sourceInput.value), ticker)
            : this.mod.convertToSaito(Number(sourceInput.value), ticker)
          : NaN;
      targetInput.value = this.formatAmountInput(Number(converted));
      updateNext();
    };
    cryptoInput.oninput = () => updateAmount(cryptoInput, saitoInput, 'crypto');
    saitoInput.oninput = () => updateAmount(saitoInput, cryptoInput, 'saito');

    if (currencySelect) {
      currencySelect.onchange = () => {
        state.crypto_selected = this.mod.available_currencies?.find(
          (currency) => currency.ticker === currencySelect.value
        );
        cryptoInput.setAttribute('aria-label', `Amount in ${currencySelect.value}`);
        const form = currencySelect.closest('.amount-selection-box');
        form.querySelectorAll('[data-payment-logo]').forEach((logo) => {
          logo.hidden = logo.dataset.paymentLogo !== currencySelect.value;
        });
        if (state.amount_input_source === 'saito') saitoInput.oninput();
        else cryptoInput.oninput();
      };
    }

    updateNext();
    nextButton.onclick = async () => {
      if (nextButton.disabled) return;
      const currency = state.crypto_selected;
      const amount = saitoInput.value;
      const deposit = cryptoInput.value;
      if (
        !currency ||
        !this.isValidAmount(cryptoInput.value) ||
        !this.isValidAmount(saitoInput.value)
      )
        return;
      if (inline && this.overlay.visible) return;
      nextButton.disabled = true;
      if (inline) {
        this.reset();
        this.active = true;
        this.app.connection.emit('saito-purchase-overlay-open', () => this.close());
        this.recipient = this.mod.publicKey;
      }
      this.crypto_selected = currency;
      this.amount = amount;
      this.expected_deposit = deposit;
      this.showOverlay(SaitoPurchaseLoaderTemplate('Requesting Payment Instructions...'));
      const session = this.session;
      await this.checkForLocalCrypto();
      if (this.active && this.session === session && this.crypto_selected === currency) {
        this.requestPaymentAddressFromServer();
      }
      if (inline) updateNext();
    };
  }

  async checkForLocalCrypto() {
    const currency = this.crypto_selected;
    const session = this.session;
    try {
      let cm = this.app.wallet.returnCryptoModuleByTicker(currency.ticker);

      if (cm?.options?.isActivated) {
        // query balance again
        await cm.activate();

        const balance = Number(await cm.getAvailableBalance());
        if (this.session === session && this.crypto_selected === currency) {
          currency.available_balance = balance;
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  sanitizeAmountInput(value, maxFractionDigits = 8) {
    const numericCharacters = String(value ?? '').replace(/[^0-9.]/g, '');
    if (!/[0-9]/.test(numericCharacters)) {
      return '';
    }

    const decimalIndex = numericCharacters.indexOf('.');
    if (decimalIndex === -1) {
      return numericCharacters;
    }

    const whole = numericCharacters.slice(0, decimalIndex) || '0';
    const fraction = numericCharacters
      .slice(decimalIndex + 1)
      .replace(/\./g, '')
      .slice(0, maxFractionDigits);

    return `${whole}.${fraction}`;
  }

  formatAmountInput(value) {
    if (!Number.isFinite(value) || value < 0) {
      return '';
    }

    return value.toLocaleString('en-US', {
      useGrouping: false,
      maximumFractionDigits: 8
    });
  }

  isValidAmount(value) {
    const amount = Number(value);
    return value !== '' && Number.isFinite(amount) && amount > 0;
  }

  canPayFromWallet() {
    const balance = Number(this.crypto_selected?.available_balance);
    const deposit = Number(this.expected_deposit);
    return (
      Number.isFinite(balance) && Number.isFinite(deposit) && deposit > 0 && balance >= deposit
    );
  }

  async payFromWallet(reservation) {
    if (
      !this.active ||
      !this.overlay.visible ||
      !reservation ||
      this.reservation !== reservation ||
      this.payment_detected ||
      this.internal_payment_pending ||
      Date.now() >= this.reserved_until ||
      !this.canPayFromWallet()
    ) {
      return;
    }

    // Clicking the button authorizes one transfer of the quoted deposit amount.
    this.internal_payment_pending = true;
    this.internal_payment_sending = true;
    this.ui_msg = 'Sending Payment...';
    this.render();
    const success = await this.handleInternalTransfer();
    if (!this.active || this.reservation !== reservation || this.payment_detected) return;
    this.internal_payment_sending = false;
    this.internal_payment_pending = success;
    this.render();
  }

  async handleInternalTransfer() {
    try {
      let cm = this.app.wallet.returnCryptoModuleByTicker(this.crypto_selected.ticker);
      if (this.address && this.mixin_id) {
        let to_address = this.address + '|' + this.mixin_id + '|mixin';
        let res = await cm.sendPayment(this.expected_deposit, to_address, 'success');
        // Mixin returns the transaction hash, or the supplied identifier when
        // no hash is included. Rejected transfers throw instead.
        return typeof res === 'string' && res.trim().length > 0;
      }
    } catch (err) {
      console.error(err);
    }

    return false;
  }

  //
  // reserve address -> poll pending deposit -> fetch receipts
  //
  async requestPaymentAddressFromServer() {
    //
    // build request payload
    //
    let data = {
      initiator_pubkey: this.mod.publicKey,
      recipient_pubkey: this.recipient,
      ticker: this.crypto_selected.ticker,
      tx: this.tx
    };

    if (Number(this.amount) > 0) {
      data.issue_amount = Number(this.amount);
    }
    if (Number(this.expected_deposit) > 0) {
      data.expected_deposit = Number(this.expected_deposit);
    }
    if (!data.issue_amount && !data.expected_deposit) {
      console.error('No valid numeric input');
      this.app.connection.emit('saito-purchase-error-notification', {
        message: 'A valid payment amount is required before requesting instructions.'
      });
      return;
    }

    console.log('Payment Address Request:', data);

    this.clearPaymentInstructionTimer();
    this.payment_instruction_timer = setTimeout(() => {
      if (!this.active || this.address) {
        return;
      }
      this.app.connection.emit('saito-purchase-error-notification', {
        message:
          'The payment service did not return instructions. Please check your connection and try again.'
      });
    }, 35000);

    if (!this.mod.buysaito_peer?.publicKey) {
      this.app.connection.emit('saito-purchase-error-notification', {
        message:
          'The payment service did not return instructions. Please check your connection and try again.'
      });
      return;
    }
    this.app.network.sendRequestAsTransaction(
      'buysaito reserve address',
      data,
      (response) => {
        if (!response?.address || response.err) {
          this.app.connection.emit('saito-purchase-error-notification', {
            message:
              response?.message ||
              response?.err ||
              'The payment service did not return instructions. Please check your connection and try again.'
          });
          return;
        }
        this.mod.pending_payments.push(response);
        this.receivePaymentAddressFromServer(response);
      },
      this.mod.buysaito_peer.publicKey
    );
  }

  receivePaymentAddressFromServer(data) {
    if (!this.active || !this.crypto_selected) return;
    if (data?.ticker && data.ticker !== this.crypto_selected.ticker) return;
    this.clearPaymentInstructionTimer();

    console.log('\n/////////////////////////////////////');
    console.log('RESERVE ADDRESS RESPONSE');
    console.log(data);
    console.log('/////////////////////////////////////\n');

    if (!data?.address || !data?.mixin_id || !data?.ticker) {
      this.app.connection.emit('saito-purchase-error-notification', {
        message: 'The payment service returned incomplete deposit instructions.'
      });
      return;
    }

    //
    // reserve address success — extract info
    //
    if (
      !this.reservation ||
      this.reservation.id !== data.id ||
      this.reservation.address !== data.address ||
      this.reservation.ticker !== data.ticker
    ) {
      this.reservation = data;
      this.payment_detected = false;
      this.internal_payment_pending = false;
      this.internal_payment_sending = false;
    }
    this.address = data.address;
    this.expected_deposit = data.expected_deposit;
    this.mixin_id = data.mixin_id;
    this.reserved_until = data.reserved_until;

    if (!this.amount) {
      this.amount = data.issue_amount;
    }

    if (['pending', 'confirmed', 'issuing'].includes(data.status)) {
      this.receivePaymentDetected(data);
    } else {
      this.startReservationTimeout(this.reserved_until);
      this.render();
    }
  }

  receivePaymentDetected(data) {
    if (
      !this.active ||
      !this.reservation ||
      data?.id !== this.reservation.id ||
      data.address !== this.address ||
      data.ticker !== this.crypto_selected?.ticker ||
      !['pending', 'confirmed', 'issuing'].includes(data.status)
    ) {
      return;
    }
    this.payment_detected = true;
    this.clearReservationTimer();
    this.ui_msg =
      data.status === 'pending'
        ? 'Payment detected. Waiting for SAITO issuance...'
        : 'Payment received. Waiting for SAITO issuance...';
    this.render();
    // The issued notice can arrive after the wallet already holds the SAITO.
    // Watch the wallet so this waiting overlay does not stay open.
    this.saito_arrival_expected = this.expectedSaitoNolan();
    void this.startSaitoArrivalWatch();
  }

  clearReservationTimer() {
    clearTimeout(this.reservation_timer);
    this.reservation_timer = null;
  }

  expectedSaitoNolan() {
    const amount = Number(this.reservation?.issue_amount || this.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return 0n;
    }
    try {
      return this.app.wallet.convertSaitoToNolan(amount);
    } catch (err) {
      return 0n;
    }
  }

  async startSaitoArrivalWatch() {
    if (this.saito_arrival_timer || !this.active || !this.payment_detected) {
      return;
    }
    const expected = this.saito_arrival_expected ?? this.expectedSaitoNolan();
    if (expected <= 0n) {
      return;
    }
    this.saito_arrival_expected = expected;
    const session = this.session;
    let baseline = 0n;
    try {
      baseline = await this.app.wallet.getBalance('SAITO');
    } catch (err) {
      console.error('BuySaito: unable to read SAITO balance for arrival watch', err);
      return;
    }
    if (session !== this.session || !this.active || !this.payment_detected || this.saito_arrival_timer) {
      return;
    }
    this.saito_arrival_baseline = baseline;
    this.saito_arrival_timer = setInterval(() => {
      void this.checkSaitoArrival();
    }, 1500);
    this.saito_arrival_timer.unref?.();
    void this.checkSaitoArrival();
  }

  stopSaitoArrivalWatch() {
    if (this.saito_arrival_timer) {
      clearInterval(this.saito_arrival_timer);
      this.saito_arrival_timer = null;
    }
    this.saito_arrival_baseline = null;
    this.saito_arrival_expected = null;
  }

  async checkSaitoArrival() {
    if (
      !this.active ||
      !this.payment_detected ||
      this.saito_issuance ||
      this.saito_arrival_baseline == null ||
      this.saito_arrival_expected == null
    ) {
      return;
    }
    let balance = 0n;
    try {
      balance = await this.app.wallet.getBalance('SAITO');
    } catch (err) {
      return;
    }
    if (balance - this.saito_arrival_baseline >= this.saito_arrival_expected) {
      this.onSaitoArrived();
    }
  }

  onSaitoArrived() {
    if (!this.active || this.saito_issuance) {
      return;
    }
    this.stopSaitoArrivalWatch();
    this.close();
  }

  startReservationTimeout(expiryMs) {
    this.clearReservationTimer();
    if (this.payment_detected || !Number.isFinite(Number(expiryMs))) return;
    this.reservation_timer = setTimeout(
      () => {
        if (this.payment_detected) return;
        this.close();
        salert('The payment time has timed out. Please try again.');
      },
      Math.max(0, Number(expiryMs) - Date.now())
    );
  }

  updateSaitoIssued(data = {}) {
    if (
      !this.overlay.visible ||
      !this.reservation ||
      data.id !== this.reservation.id ||
      data.address !== this.reservation.address ||
      data.ticker !== this.reservation.ticker ||
      !data.paid
    ) {
      return;
    }
    this.stopSaitoArrivalWatch();
    this.active = false;
    clearTimeout(this.timer);
    this.clearReservationTimer();
    this.clearPaymentInstructionTimer();
    this.saito_issuance = data;
    this.renderSaitoCompletion();
  }

  receiveSaitoPayment(data) {
    if (
      !this.overlay.visible ||
      !this.reservation ||
      data?.ticker !== 'SAITO' ||
      data.receiver !== this.mod.publicKey ||
      !Number.isFinite(Number(data.amount)) ||
      Number(data.amount) <= 0
    ) {
      return;
    }

    const peer = this.mod.buysaito_peer?.publicKey;
    if (peer && data.sender && data.sender !== peer) {
      return;
    }

    // While waiting for issuance, wallet arrival is enough to dismiss the overlay.
    if (this.active && this.payment_detected && !this.saito_issuance) {
      try {
        const expected = this.saito_arrival_expected ?? this.expectedSaitoNolan();
        const received = this.app.wallet.convertSaitoToNolan(data.amount);
        if (expected > 0n && received >= expected) {
          this.onSaitoArrived();
          return;
        }
      } catch (err) {
        // Fall through to the signature receipt path below.
      }
    }

    if (
      data.sender !== this.mod.buysaito_peer?.publicKey ||
      !data.signature
    ) {
      return;
    }
    // The browser can receive the payout block before the treasury's relay notice.
    // Retain receipts for this purchase session and match its exact payout signature.
    if (this.saito_receipts.has(data.signature)) return;
    this.saito_receipts.set(data.signature, data.amount);
    if (this.saito_issuance?.paid === data.signature) {
      this.renderSaitoCompletion();
    }
  }

  renderSaitoCompletion() {
    if (!this.overlay.visible || !this.saito_issuance) return;
    this.showOverlay(
      SaitoPurchaseCompleteTemplate(this.app, {
        ...this.saito_issuance,
        received_amount: this.saito_receipts.get(this.saito_issuance.paid)
      })
    );
  }

  showOverlay(html) {
    this.overlay.closebox = true;
    this.overlay.show(html, () => {
      this.active = false;
      this.reset();
    });
  }

  close() {
    this.active = false;
    this.reset();
    this.overlay.close();
  }

  clearPaymentInstructionTimer() {
    if (this.payment_instruction_timer) {
      clearTimeout(this.payment_instruction_timer);
      this.payment_instruction_timer = null;
    }
  }

  reset() {
    console.log('Reset Saito-Purchase Values');
    this.session++;
    this.mod.pending_payments = [];

    //
    // reset values (incase we want to reuse the overlay)
    //
    this.amount = 0;
    this.internal_transfer = null;
    this.expected_deposit = 0;
    this.amount_input_source = 'crypto';
    this.reserved_until = 0;
    this.crypto_selected = false;
    this.tx = null;
    this.recipient = '';
    this.address = '';
    this.description = '';
    this.payment_detected = false;
    this.internal_payment_pending = false;
    this.internal_payment_sending = false;
    this.reservation = null;
    this.saito_issuance = null;
    this.saito_receipts.clear();

    this.acquisition_stage = 'default';
    this.acquisition_options = [];
    this.stage1_html = null;
    this.stage1_footer_html = null;
    this.faucet_already_issued = null;

    clearTimeout(this.timer);
    this.timer = null;
    this.clearPaymentInstructionTimer();
    this.stopSaitoArrivalWatch();
    this.clearReservationTimer();
  }
}

module.exports = SaitoPurchaseOverlay;
