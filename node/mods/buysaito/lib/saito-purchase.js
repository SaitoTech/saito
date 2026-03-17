const SaitoPurchaseTemplate = require('./saito-purchase.template');
const SaitoPurchaseLoaderTemplate = require('./saito-purchase-loader.template');
const SaitoPurchaseErrorTemplate = require('./saito-purchase-error.template');
const SaitoPurchaseAmountTemplate = require('./saito-purchase-amount.template');

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
    this.show_percentage_buttons = false;
    this.launch_options = {};
    this.overlay_dropdown_listener_set = false;

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
      async (amount, recipient = '', tx = null, description = '', launch_options = {}) => {
        this.reset();
        this.amount = Number(amount);
        this.description = description;
        this.recipient = recipient || this.mod.publicKey;
        this.tx = tx;
        this.launch_options = launch_options || {};

        if (this.mod.available_currencies?.length == 0) {
          this.overlay.show(SaitoPurchaseLoaderTemplate('Checking availability...'));
          this.app.connection.emit('relay-send-message', {
            recipient: this.mod.authorized_public_key,
            request: 'buysaito available currencies',
            data: null
          });

          this.timer = setTimeout(() => {
            this.mod.available_currencies = null;
            this.render();
          }, 5000);

          return;
        }

        if (this.launch_options?.ticker) {
          this.crypto_selected =
            this.mod.available_currencies.find((c) => c.ticker === this.launch_options.ticker) || false;
        }
        if (Number(this.launch_options?.expected_deposit) > 0) {
          this.expected_deposit = Number(this.launch_options.expected_deposit);
        }

        if (this.launch_options?.autostart && (this.amount > 0 || this.expected_deposit > 0)) {
          await this.startAutostartFlow();
          return;
        }

        if (!amount) {
          this.fancy_ui = false;
        }

        if (this.fancy_ui) {
          // More complicated but smoother transition while fetching info
          this.overlay.show(SaitoPurchaseLoaderTemplate('Checking availability...'));
          setTimeout(() => {
            this.render();
          }, 1000);
          this.fancy_ui = false;
        } else {
          this.render();
        }
      }
    );

    app.connection.on('saito-purchase-cryptos', () => {
      console.log('saito-purchase-cryptos', this.mod.available_currencies);
      clearTimeout(this.timer);
      setTimeout(async () => {
        this.fancy_ui = false;

        if (this.launch_options?.ticker) {
          this.crypto_selected =
            this.mod.available_currencies.find((c) => c.ticker === this.launch_options.ticker) || false;
        }
        if (Number(this.launch_options?.expected_deposit) > 0) {
          this.expected_deposit = Number(this.launch_options.expected_deposit);
        }

        if (this.launch_options?.autostart && (this.amount > 0 || this.expected_deposit > 0)) {
          await this.startAutostartFlow();
        } else {
          this.render();
        }
      }, 1000);
    });
  }

  async startAutostartFlow() {
    if (!this.crypto_selected && this.mod.available_currencies.length > 0) {
      this.crypto_selected = this.mod.available_currencies[0];
    }
    if (!this.crypto_selected) {
      this.render();
      return;
    }

    if (!(this.amount > 0) && this.expected_deposit > 0) {
      this.amount = this.mod.convertToSaito(this.expected_deposit, this.crypto_selected.ticker);
    }
    if (!(this.expected_deposit > 0) && this.amount > 0) {
      this.expected_deposit = this.mod.convertSaitoToOther(this.amount, this.crypto_selected.ticker);
    }

    if (!(this.amount > 0) && !(this.expected_deposit > 0)) {
      this.render();
      return;
    }

    await this.checkForLocalCrypto();
    this.overlay.show(SaitoPurchaseLoaderTemplate('Requesting Payment Instructions...'));
    this.requestPaymentAddressFromServer();
  }

  async render() {
    this.overlay.remove();

    console.debug(
      'SaitoPurchaseOverlay Rendering...',
      this.amount,
      this.description,
      this.crypto_selected,
      this.tx
    );

    if (!this.mod.available_currencies) {
      salert('Service currently not available');
      return;
    }
    if (this.mod.available_currencies.length === 0) {
      salert('No payment currencies are currently available');
      return;
    }

    if (!this.crypto_selected && this.mod.available_currencies.length > 0) {
      this.crypto_selected = this.mod.available_currencies[0];
    }

    if (!this.destination) {
      await this.checkForLocalCrypto();

      if (this.amount > 0 && !this.expected_deposit) {
        this.expected_deposit = this.mod.convertSaitoToOther(this.amount, this.crypto_selected.ticker);
      } else if (this.expected_deposit > 0 && !this.amount) {
        this.amount = this.mod.convertToSaito(this.expected_deposit, this.crypto_selected.ticker);
      }

      this.overlay.show(SaitoPurchaseAmountTemplate(this.app, this.mod, this));
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

    this.attachEvents();
  }

  attachEvents() {
    const payAmountInput = document.getElementById('pay-amount-input');
    const receiveAmountInput = document.getElementById('receive-saito-input');
    const cryptoSelect = document.getElementById('pay-crypto-select');
    const cryptoTrigger = document.getElementById('pay-crypto-trigger');
    const cryptoMenu = document.getElementById('pay-crypto-menu');
    let currentTicker = cryptoSelect?.getAttribute('data-value') || this.crypto_selected?.ticker || '';

    if (!currentTicker && this.mod.available_currencies.length > 0) {
      currentTicker = this.mod.available_currencies[0].ticker;
    }

    if (cryptoSelect && currentTicker) {
      cryptoSelect.setAttribute('data-value', currentTicker);
    }
    if (cryptoTrigger && currentTicker) {
      cryptoTrigger.querySelector('.buysaito-select-trigger-label').innerText = currentTicker;
    }

    if (cryptoMenu) {
      cryptoMenu.querySelectorAll('.buysaito-select-option').forEach((option) => {
        option.onclick = async () => {
          let ticker = option.getAttribute('data-ticker') || '';
          if (!ticker) {
            return;
          }

          currentTicker = ticker;
          if (cryptoSelect) {
            cryptoSelect.setAttribute('data-value', currentTicker);
          }
          if (cryptoTrigger) {
            cryptoTrigger.querySelector('.buysaito-select-trigger-label').innerText = currentTicker;
          }
          cryptoMenu.classList.add('hidden');

          this.crypto_selected =
            this.mod.available_currencies.find((c) => c.ticker === currentTicker) || false;
          if (!this.crypto_selected) {
            salert('Error reading crypto selection');
            return;
          }

          await this.checkForLocalCrypto();

          if (this.amount > 0) {
            this.expected_deposit = this.mod.convertSaitoToOther(this.amount, this.crypto_selected.ticker);
          } else if (this.expected_deposit > 0) {
            this.amount = this.mod.convertToSaito(this.expected_deposit, this.crypto_selected.ticker);
          }
          this.render();
        };
      });
    }

    if (cryptoTrigger && cryptoMenu) {
      cryptoTrigger.onclick = (e) => {
        e.stopPropagation();
        cryptoMenu.classList.toggle('hidden');
      };
      if (!this.overlay_dropdown_listener_set) {
        document.addEventListener('click', () => {
          cryptoMenu.classList.add('hidden');
        });
        this.overlay_dropdown_listener_set = true;
      }
    }

    if (currentTicker) {
      this.crypto_selected = this.mod.available_currencies.find((c) => c.ticker === currentTicker) || false;
    }
    if (!this.crypto_selected && this.mod.available_currencies.length > 0) {
      this.crypto_selected = this.mod.available_currencies[0];
    }
    if (!this.crypto_selected) {
      salert('Error reading crypto selection');
      return;
    }

    if (cryptoSelect) {
      cryptoSelect.setAttribute('data-value', this.crypto_selected.ticker);
    }
    if (cryptoTrigger) {
      cryptoTrigger.querySelector('.buysaito-select-trigger-label').innerText =
        this.crypto_selected.ticker;
    }

    if (payAmountInput && receiveAmountInput) {
      payAmountInput.oninput = () => {
        let amount = Number(payAmountInput.value || 0);
        if (amount > 0) {
          this.expected_deposit = amount;
          this.amount = this.mod.convertToSaito(amount, this.crypto_selected.ticker);
        } else {
          this.expected_deposit = 0;
          this.amount = 0;
        }
        receiveAmountInput.value = this.amount > 0 ? this.amount : '';
      };
      payAmountInput.onchange = payAmountInput.oninput;
      payAmountInput.onkeyup = payAmountInput.oninput;

      receiveAmountInput.oninput = () => {
        let amount = Number(receiveAmountInput.value || 0);
        if (amount > 0) {
          this.amount = amount;
          this.expected_deposit = this.mod.convertSaitoToOther(amount, this.crypto_selected.ticker);
        } else {
          this.amount = 0;
          this.expected_deposit = 0;
        }
        payAmountInput.value = this.expected_deposit > 0 ? this.expected_deposit : '';
      };
      receiveAmountInput.onchange = receiveAmountInput.oninput;
      receiveAmountInput.onkeyup = receiveAmountInput.oninput;
    }

    document.querySelectorAll('.purchase-percent-btn').forEach((el) => {
      el.onclick = () => {
        let percent = Number(el.getAttribute('data-percent'));
        let max = Number(this.crypto_selected?.available_balance || 0);
        if (!(max > 0)) {
          return;
        }
        let spend = (max * percent) / 100;
        this.expected_deposit = Math.floor(spend * 1000000) / 1000000;
        this.amount = this.mod.convertToSaito(this.expected_deposit, this.crypto_selected.ticker);
        if (payAmountInput) {
          payAmountInput.value = this.expected_deposit;
        }
        if (receiveAmountInput) {
          receiveAmountInput.value = this.amount;
        }
      };
    });

    if (document.getElementById('next-purchase-btn')) {
      document.getElementById('next-purchase-btn').onclick = () => {
        this.expected_deposit = Number(this.expected_deposit || 0);
        this.amount = Number(this.amount || 0);

        if (!(this.expected_deposit > 0) && !(this.amount > 0)) {
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
    if (document.querySelector('.payment-box .pubkey-containter')) {
      document.querySelector('.payment-box .pubkey-containter').onclick = (e) => {
        navigator.clipboard.writeText(this.destination);
        let icon_element = document.querySelector('.payment-box .pubkey-containter i');
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
    if (!this.crypto_selected?.ticker) {
      this.show_percentage_buttons = false;
      return;
    }
    try {
      let cm = this.app.wallet.returnCryptoModuleByTicker(this.crypto_selected.ticker);
      this.show_percentage_buttons = false;
      this.crypto_selected.available_balance = 0;

      if (cm?.options?.isActivated) {
        // query balance again
        await cm.activate();
        this.crypto_selected.available_balance = Number(cm.returnBalance()) || 0;
        this.show_percentage_buttons = this.crypto_selected.available_balance > 0;
      }
    } catch (err) {
      console.error(err);
      this.show_percentage_buttons = false;
      this.crypto_selected.available_balance = 0;
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
      let el = document.querySelector('.payment-box .timer');

      if (!el) {
        console.log('[countdown] .payment-box .timer not found — stopping interval');
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
    this.show_percentage_buttons = false;
    this.launch_options = {};

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
