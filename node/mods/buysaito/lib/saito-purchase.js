const SaitoPurchaseTemplate = require('./saito-purchase.template');
const SaitoPurchaseLoaderTemplate = require('./saito-purchase-loader.template');
const SaitoPurchaseErrorTemplate = require('./saito-purchase-error.template');
const SaitoPurchaseCryptoTemplate = require('./saito-purchase-select-crypto.template');
const SaitoPurchaseAmountTemplate = require('./saito-purchase-amount.template');
const SaitoPurchaseFaucetAuthTemplate = require('./saito-purchase-faucet-auth.template');

const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');

class SaitoPurchaseOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    this.overlay = new SaitoOverlay(app, mod, false, true);

    //
    // init
    //
    this.amount = 0;
    this.expected_deposit = 0;
    this.crypto_selected = false;
    this.tx = null;
    this.recipient = '';
    this.description = '';
    this.deposit_confirmed_by_user = false;
    this.reserved_until = 0;
    this.fancy_ui = true;
    this.active = false;

    this.acquisition_stage = 'default';
    this.acquisition_options = [];
    this.stage1_html = null;
    this.stage1_footer_html = null;

    this.countdown_interval = null;

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

    app.connection.on('saito-purchase-address-reserved', (data) => {
      this.receivePaymentAddressFromServer(data);
    });

    app.connection.on('saito-purchase-error-notification', () => {
      this.overlay.close();
      this.overlay.closebox = true;
      this.overlay.show(SaitoPurchaseErrorTemplate());
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
          this.overlay.show(SaitoPurchaseLoaderTemplate('Checking availability...'));
          this.app.connection.emit('relay-send-message', {
            recipient: this.mod.authorized_public_key,
            request: 'buysaito available currencies',
            data: null
          });

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
          this.overlay.show(SaitoPurchaseLoaderTemplate('Checking availability...'));
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
      if (!this.active) {
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
      this.acquisition_stage && this.acquisition_stage !== 'default'
        ? this.acquisition_stage
        : '';

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
      this.overlay.closebox = true;
      this.overlay.show(SaitoPurchaseCryptoTemplate(this.app, this.mod, this));
    } else {
      if (!this.destination) {
        // 1.5 alternate amount selection
        if (!this.amount) {
          this.overlay.show(SaitoPurchaseAmountTemplate(this.app, this.mod, this));
        } else {
          //
          // 2. show loading screen after selecting crypto ticker
          //
          this.overlay.show(SaitoPurchaseLoaderTemplate(this.ui_msg, ''));
        }
      } else {
        //
        // 3. Show address screen when deposit address is created/fetched
        //
        if (!this.deposit_confirmed_by_user) {
          this.overlay.show(SaitoPurchaseTemplate(this.app, this.mod, this));
          this.overlay.blockClose('#confirm-purchase-btn');
          this.app.browser.generateQRCode(this.destination, 'pqrcode');
          this.startReservationCountdown(this.reserved_until);

          if (this.crypto_selected.available_balance >= this.expected_deposit) {
            let c = await sconfirm(
              `Authorize ${this.expected_deposit} ${this.crypto_selected.ticker} payment from Saito Multiwallet balance?`
            );
            if (c) {
              this.overlay.show(SaitoPurchaseLoaderTemplate('Sending Payment...'));
              let success = await this.handleInternalTransfer();
              if (success) {
                this.overlay.closebox = true;
                this.deposit_confirmed_by_user = true;
                this.ui_msg = 'Polling network transfer...';
                this.render();
              }
            }
          }
        } else {
          //
          // 4. Show loading screen when payment, deposited by user, is confirmed
          //
          this.overlay.show(SaitoPurchaseLoaderTemplate(this.ui_msg));
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
          opt &&
          (opt.title || opt.text) &&
          (typeof opt.callback === 'function' || opt.inline_stage)
      )
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));

    this.acquisition_options = options;

    if (!options.length) {
      container.innerHTML = '';
      this.updatePurchaseMethodHeading(false);
      return;
    }

    if (this.faucet_already_issued) {
      container.innerHTML = `
      <div class="buysaito-option buysaito-option-faucet-issued" role="status">
        <div class="buysaito-option-icon">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
        </div>
        <div class="buysaito-option-copy">
          <div class="buysaito-option-title">Faucet allocation already received</div>
          <div class="buysaito-option-description">
            This Saito public key has already received its one-time SAITO allocation from the network faucet.
            You can continue with purchase options below, or close this window and return to your previous action.
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
   * Replace the green Faucet intro card with a neutral/orange notice that this
   * public key has already received its one-time faucet allocation.
   * Keeps Get SAITO open; does not open the Faucet claim overlay.
   */
  showFaucetAlreadyIssuedNotice() {
    this.faucet_already_issued = true;

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
    document
      .getElementById('purchase-container')
      ?.classList.remove('buysaito-stage-faucet-auth');

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
      stageEl.innerHTML = SaitoPurchaseFaucetAuthTemplate(
        providers,
        opt?.auth_message
      );
      document
        .getElementById('purchase-container')
        ?.classList.add('buysaito-stage-faucet-auth');

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
    document
      .getElementById('purchase-container')
      ?.classList.remove('buysaito-stage-faucet-auth');

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

        this.overlay.closebox = false;
        console.log(this.crypto_selected);
        await this.checkForLocalCrypto();

        if (this.amount) {
          this.overlay.show(SaitoPurchaseLoaderTemplate('Requesting Payment Instructions...'));
          this.requestPaymentAddressFromServer();
        } else {
          this.render();
        }
      };
    });

    //////////////////////
    // Select Amount Form
    /////////////////////
    if (document.getElementById('back-purchase-btn')) {
      document.getElementById('back-purchase-btn').onclick = (e) => {
        this.reset();
        this.render();
      };
    }

    const input = document.getElementById('input-amount');
    const output = document.querySelector('.expected_amount');

    if (input && output) {
      input.onchange = (e) => {
        let amount = input.value;
        output.value = this.mod.convertToSaito(amount, this.crypto_selected.ticker);
      };
      input.onkeyup = (e) => {
        let amount = input.value;
        output.value = this.mod.convertToSaito(amount, this.crypto_selected.ticker);
      };
    }

    if (document.getElementById('next-purchase-btn')) {
      document.getElementById('next-purchase-btn').onclick = (e) => {
        this.expected_deposit = document.querySelector('#input-amount').value;

        if (!this.expected_deposit) {
          salert('Invalid input');
          return;
        }

        this.overlay.show(SaitoPurchaseLoaderTemplate('Requesting Payment Instructions...'));
        this.requestPaymentAddressFromServer();
      };
    }

    ///////////////////
    // Deposit form
    ///////////////////
    if (document.querySelector('.buysaito-payment-box .pubkey-container')) {
      document.querySelector('.buysaito-payment-box .pubkey-container').onclick = (e) => {
        navigator.clipboard.writeText(this.destination);
        let icon_element = document.querySelector('.buysaito-payment-box .pubkey-container i');
        icon_element.classList.toggle('fa-copy');
        icon_element.classList.toggle('fa-check');
        setTimeout(() => {
          icon_element.classList.toggle('fa-copy');
          icon_element.classList.toggle('fa-check');
        }, 800);
      };
    }

    if (document.getElementById('cancel-purchase-btn')) {
      document.getElementById('cancel-purchase-btn').onclick = async () => {
        this.app.connection.emit('relay-send-message', {
          recipient: this.mod.authorized_public_key,
          request: 'buysaito release address',
          data: { ticker: this.crypto_selected.ticker }
        });
        this.reset();
        this.overlay.close();
      };
    }

    if (document.getElementById('confirm-purchase-btn')) {
      document.getElementById('confirm-purchase-btn').onclick = async () => {
        this.overlay.closebox = true;
        this.deposit_confirmed_by_user = true;
        this.ui_msg = 'Polling pending payment...';
        this.render();
      };
    }
  }

  async checkForLocalCrypto() {
    try {
      let cm = this.app.wallet.returnCryptoModuleByTicker(this.crypto_selected.ticker);

      if (cm?.options?.isActivated) {
        // query balance again
        await cm.activate();

        this.crypto_selected.available_balance = Number(await cm.getAvailableBalance());
      }
    } catch (err) {
      console.error(err);
    }
  }

  async handleInternalTransfer() {
    try {
      let cm = this.app.wallet.returnCryptoModuleByTicker(this.crypto_selected.ticker);
      if (this.destination && this.mixin_id) {
        let to_address = this.destination + '|' + this.mixin_id + '|mixin';
        let res = await cm.sendPayment(this.expected_deposit, to_address, 'success');
        if (res == 'success') {
          return true;
        }
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

    if (this.amount) {
      data.issue_amount = this.amount;
    } else if (this.expected_deposit) {
      data.expected_deposit = this.expected_deposit;
    } else {
      console.error('No valid numeric input');
      return;
    }

    console.log('Payment Address Request:', data);

    this.app.connection.emit('relay-send-message', {
      recipient: this.mod.authorized_public_key,
      request: 'buysaito reserve address',
      data
    });
  }

  receivePaymentAddressFromServer(data) {
    console.log('\n/////////////////////////////////////');
    console.log('RESERVE ADDRESS RESPONSE');
    console.log(data);
    console.log('/////////////////////////////////////\n');

    if (this.crypto_selected && data.ticker !== this.crypto_selected.ticker) {
      salert('You have an active pending deposit for a different crypto');
      console.debug(data);
      console.debug(
        this.crypto_selected,
        this.issue_amount,
        this.expected_deposit,
        this.description,
        this.destination
      );
      return;
    }
    //
    // reserve address success — extract info
    //
    this.destination = data.destination;
    this.expected_deposit = data.expected_deposit;
    this.mixin_id = data.mixin_id;
    this.reserved_until = data.reserved_until;

    // Fallback recover data from rerunning...
    if (!this.crypto_selected) {
      for (let i = 0; i < this.mod.available_currencies.length; i++) {
        if (this.mod.available_currencies[i].ticker == data.ticker)
          this.crypto_selected = this.mod.available_currencies[i];
      }
    }
    if (!this.amount) {
      this.amount = data.issue_amount;
    }

    //
    // update UI
    //
    this.render();
  }

  startReservationCountdown(expiryMs) {
    //
    // clear any previous countdown
    //
    if (this.countdown_interval) {
      console.log('[countdown] clearing existing interval');
      clearInterval(this.countdown_interval);
      this.countdown_interval = null;
    }

    console.log(
      '[countdown] startReservationCountdown called with expiryMs:',
      expiryMs,
      '=>',
      new Date(expiryMs).toISOString()
    );

    let formatHMS = (msLeft) => {
      let total = Math.max(0, Math.floor(msLeft / 1000));
      let h = Math.floor(total / 3600);
      let m = Math.floor((total % 3600) / 60);
      let s = total % 60;
      let pad = (n) => String(n).padStart(2, '0');
      return `${pad(m)}:${pad(s)}`;
    };

    let tick = () => {
      //
      // locate timer element
      //
      let el = document.querySelector('.buysaito-payment-box .timer');

      if (!el) {
        console.log('[countdown] .buysaito-payment-box .timer not found — stopping interval');
        clearInterval(this.countdown_interval);
        this.countdown_interval = null;
        return;
      }

      //
      // compute time remaining
      //
      let now = Date.now();
      let msLeft = expiryMs - now;

      //console.log('[countdown] tick', { now, expiryMs, msLeft });

      if (msLeft <= 0) {
        console.log('[countdown] expired — setting 00:00:00 and stopping');
        salert('Countdown for crypto payment expired');
        el.textContent = '00:00:00';
        clearInterval(this.countdown_interval);
        this.countdown_interval = null;
        this.reset();
        this.overlay.close();
        return;
      }

      let fmt = formatHMS(msLeft);
      //console.log('[countdown] updating display to', fmt);
      el.textContent = fmt;
    };

    //
    // prime once immediately and then every second
    //
    tick();
    this.countdown_interval = setInterval(tick, 1000);

    console.log('[countdown] interval started (1s)');
  }

  updateSaitoIssued(data = {}) {
    this.overlay.remove();
    let msg = 'SAITO issuance processed! Please wait for the confirmation on chain...';
    if (data?.paid) {
      msg += `<div class="txsig">
                <div class="sig-header">TX sig:</div>
                <div class="sig monospace">${data.paid}</div>
              <div>
      `;
    }
    salert(msg);
    this.reset();
  }

  close() {
    this.active = false;
    this.reset();
    this.overlay.close();
  }

  reset() {
    console.log('Reset Saito-Purchase Values');
    this.mod.pending_payments = [];

    //
    // reset values (incase we want to reuse the overlay)
    //
    this.amount = 0;
    this.internal_transfer = null;
    this.expected_deposit = 0;
    this.reserved_until = 0;
    this.crypto_selected = false;
    this.tx = null;
    this.recipient = '';
    this.destination = '';
    this.description = '';
    this.deposit_confirmed_by_user = false;

    this.acquisition_stage = 'default';
    this.acquisition_options = [];
    this.stage1_html = null;
    this.stage1_footer_html = null;

    clearTimeout(this.timer);
    this.timer = null;

    //
    // reset countdown timer
    //
    if (this.countdown_interval) {
      clearInterval(this.countdown_interval);
      this.countdown_interval = null;
    }
  }
}

module.exports = SaitoPurchaseOverlay;
