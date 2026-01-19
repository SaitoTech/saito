const SaitoPurchaseTemplate = require('./saito-purchase.template');
const SaitoPurchaseLoaderTemplate = require('./saito-purchase-loader.template');
const SaitoPurchaseCryptoTemplate = require('./saito-purchase-select-crypto.template');

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
    this.crypto_selected = false;
    this.tx = null;
    this.description = '';
    this.deposit_confirmed = false;
    this.reserved_until = 0;

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

    app.connection.on('saito-purchase-pending-deposit-confirmed', async (data) => {
      this.updatePendingDepositConfirmed(data);
    });

    app.connection.on('saito-purchase-address-reserved', (data) => {
      this.receivePaymentAddressFromServer(data);
    });

    app.connection.on('saito-purchase-launch', (amount, tx = null, description = '') => {
      this.reset();
      this.amount = Number(amount);
      this.description = description;

      // More complicated but smoother transition while fetching info
      this.overlay.show(SaitoPurchaseLoaderTemplate('Checking availability...'));
      setTimeout(async () => {
        this.tx = tx || (await this.mod.createBuySaitoTransaction());
        if (this.mod.available_currencies?.length) {
          setTimeout(() => {
            this.render();
          }, 1000);
        } else {
          siteMessage('No cryptocurrencies available', 3000);
          this.overlay.remove();
        }
      }, 50);
    });
  }

  async render() {
    let self = this;
    this.overlay.remove();

    console.log(
      'SaitoPurchaseOverlay Rendering...',
      this.amount,
      this.description,
      this.crypto_selected,
      this.tx
    );

    if (!this.crypto_selected) {
      //
      // 1. user selects crypto
      //
      this.overlay.show(SaitoPurchaseCryptoTemplate(this.app, this.mod, this));
    } else {
      if (!this.destination) {
        //
        // 2. show loading screen after selecting crypto ticker
        //
        this.overlay.show(SaitoPurchaseLoaderTemplate(this.ui_msg));
      } else {
        //
        // 3. Show address screen when deposit address is created/fetched
        //
        if (!this.deposit_confirmed) {
          this.overlay.show(SaitoPurchaseTemplate(this.app, this.mod, this));
          this.app.browser.generateQRCode(this.destination, 'pqrcode');
        } else {
          //
          // 4. Show loading screen when payment, deposited by user, is confirmed
          //
          this.overlay.show(SaitoPurchaseLoaderTemplate(this.app, this.mod, this, this.ui_msg));
        }
      }
    }

    this.attachEvents();
  }

  attachEvents() {
    document.querySelectorAll('.purchase-crypto-item').forEach((el) => {
      el.onclick = (e) => {
        for (let i = 0; i < this.mod.available_currencies.length; i++) {
          if (this.mod.available_currencies[i].ticker == e.currentTarget.id)
            this.crypto_selected = this.mod.available_currencies[i];
        }
        if (!this.crypto_selected) {
          salert('Error reading crypto selection');
          return;
        }
        this.overlay.show(SaitoPurchaseLoaderTemplate('Requesting Payment Instructions...'));
        this.requestPaymentAddressFromServer();
      };
    });

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
  }

  //
  // reserve address -> poll pending deposit -> fetch receipts
  //
  async requestPaymentAddressFromServer() {
    //
    // build request payload
    //
    let data = {
      publicKey: this.mod.publicKey,
      issue_amount: this.amount, // saito amount
      ticker: this.crypto_selected.ticker,
      tx: this.tx.serialize_to_web(this.app)
    };
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
    console.log(this.crypto_selected, this.amount);

    //
    // reserve address success — extract info
    //
    this.destination = data.destination;
    this.expected_deposit = data.expected_deposit;

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
    this.startReservationCountdown(data.reserved_until);
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

  updatePendingDepositConfirmed(data = {}) {
    this.overlay.remove();

    salert('Your deposit is confirmed. Sending SAITO to your wallet...');
  }

  updateSaitoIssued(data = {}) {
    this.overlay.remove();

    salert('Transation to issue SAITO sent. Please wait for network confirmation...');
  }

  reset() {
    console.log('Reset Saito-Purchase Values');
    //
    // reset values (incase we want to reuse the overlay)
    //
    this.amount = 0;
    this.crypto_selected = false;
    this.tx = null;
    this.destination = '';
    this.description = '';

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
