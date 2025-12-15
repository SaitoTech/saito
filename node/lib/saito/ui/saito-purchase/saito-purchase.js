const SaitoPurchaseTemplate = require('./saito-purchase.template');
const SaitoPurchaseLoaderTemplate = require('./saito-purchase-loader.template');
const SaitoPurchaseCryptoTemplate = require('./saito-purchase-select-crypto.template');
const SaitoOverlay = require('./../saito-overlay/saito-overlay');

class AssetstoreSaitoPurchaseOverlay {
  constructor(app, mod, container = 'body') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.purchase_overlay = new SaitoOverlay(app, mod, false, true);

    //
    // init
    //
    this.address = '';
    this.ticker = '';
    this.amount = 0;
    this.crypto_selected = false;
    this.tx = null;
    this.saito_amount = 0;
    this.title = '';
    this.description = '';
    this.exchange_rate = '';
    this.deposit_confirmed = false;
    this.available_cryptos = [];

    this.addr_obj = {}; // { id, ticker, address, asset_id, chain_id, created_at, reserved_until, reserved_by }
    this.req_obj = {}; // { id, reserved_until, remaining_minutes, expected_amount }
    this.pool = {}; // { ticker, total, limit }

    this.countdown_interval = null;
    this.pending_interval = null;

    this.ui_msg = '';

    app.connection.on('saito-purchase-pending-deposit-confirmed', async (data) => {
      this.updatePendingDepositConfirmed(data);
    });

    app.connection.on('saito-purchase-saito-issued', async (data) => {
      this.updateSaitoIssued(data);
    });
  }

  async render() {
    console.log('render saito-purchase');
    let self = this;
    this.purchase_overlay.remove();

    if (!this.available_cryptos.length > 0) {
      //
      // fetch crypto list available at server
      //
      await this.loadAvailableCryptos();
    }

    if (!this.crypto_selected) {
      //
      // 1. user selects crypto
      //
      this.purchase_overlay.show(SaitoPurchaseCryptoTemplate(this.app, this.mod, this));
    } else {
      if (!this.address) {
        //
        // 2. show loading screen after selecting crypto ticker
        //
        this.purchase_overlay.show(
          SaitoPurchaseLoaderTemplate(this.app, this.mod, this, this.ui_msg)
        );
      } else {
        //
        // 3. Show address screen when deposit address is created/fetched
        //
        if (!this.deposit_confirmed) {
          this.purchase_overlay.show(SaitoPurchaseTemplate(this.app, this.mod, this));
          this.app.browser.generateQRCode(this.address, 'pqrcode');
        } else {
          //
          // 4. Show loading screen when payment, deposited by user, is confirmed
          //
          this.purchase_overlay.show(
            SaitoPurchaseLoaderTemplate(this.app, this.mod, this, this.ui_msg)
          );
        }
      }
    }

    this.attachEvents();
  }

  attachEvents() {
    let self = this;

    document.querySelectorAll('.purchase-crypto-item').forEach((el) => {
      el.onclick = (e) => {
        let ticker = e.currentTarget.id;
        let saito_rate = 0.005; // SAITO USD value
        let conversion_rate = 0;

        //
        // TODO: calculate conversion rate with dynamic values
        //

        // switch (ticker) {
        //   case 'btc':
        //     conversion_rate = 0.000001;
        //     break;
        //   case 'eth':
        //     conversion_rate = 0.00002;
        //     break;
        //   case 'trx':
        //     conversion_rate = 0.5;
        //     break;
        //   default:
        //     conversion_rate = 1.0;
        // }

        // let converted_amount = (this.saito_amount * saito_rate) / conversion_rate;

        //
        // hardcoded to 1 TRX for testing
        //
        converted_amount = 1;

        self.requestPaymentAddressFromServer(converted_amount, ticker);

        //
        // re-render self to show spinning loader
        //
        self.crypto_selected = true;
        self.ui_msg = 'Requesting Payment Instructions';
        self.render();
      };
    });

    let extend_timer = document.querySelector('.extend-timer');
    if (extend_timer) {
      extend_timer.onclick = async (e) => {
        salert('Sending purchase request again to extend timer...');
      };
    }
  }

  //
  // fetch tickers from server and cache locally
  //
  async loadAvailableCryptos() {
    let self = this;
    console.log('loadAvailableCryptos -> request');

    let ack = await new Promise((resolve) => {
      self.app.network.sendRequestAsTransaction('mixin fetch crypto mods', {}, (res) =>
        resolve(res)
      );
    });

    console.log('loadAvailableCryptos response:', ack);

    if (Array.isArray(ack) && ack.length > 0) {
      this.available_cryptos = ack.map((t) => (t || '').toUpperCase());
      console.log('available_cryptos:', this.available_cryptos);
      return { ok: true, tickers: this.available_cryptos };
    }

    console.warn('no cryptos returned');
    return { ok: false, err: 'empty_list' };
  }

  //
  // reserve address -> poll pending deposit -> fetch receipts
  //
  async requestPaymentAddressFromServer(converted_amount, ticker) {
    let self = this;

    //
    // build request payload
    //
    let data = {
      publickey: self.mod.publicKey,
      expected_amount: converted_amount, // ticker amount
      issue_amount: self.saito_amount, // saito amount
      minutes: 30,
      ticker,
      tx: self.tx.serialize_to_web(self.app)
    };
    console.log('Request data:', data);

    //
    // reserve address
    //
    let res = await new Promise((resolve) => {
      self.app.network.sendRequestAsTransaction('mixin request payment address', data, (r) =>
        resolve(r || { ok: false, err: 'no_response' })
      );
    });

    try {
      console.log('            ');
      console.log('/////////////////////////////////////');
      console.log('/////////////////////////////////////');
      console.log('RESERVE ADDRESS RESPONSE');
      console.log(res);
      console.log('/////////////////////////////////////');
      console.log('/////////////////////////////////////');
      console.log('            ');

      //
      // reserve address - failure handling
      //
      if (!res || res.ok !== true || !res.address) {
        let msg = res && res.err ? res.err : 'Unable to create purchase address';
        salert(msg);
        self.purchase_overlay.remove();
        return { ok: false, err: msg };
      }

      //
      // reserve address success — extract info
      //
      self.addr_obj = res.address; // { id, ticker, address, asset_id, chain_id, ... }
      self.req_obj = res.request; // { id, reserved_until, remaining_minutes, expected_amount }
      self.pool = res.pool; // { ticker, total, limit }
      self.exchange_rate = '0.003 SAITO / USDC';

      //
      // assign values
      //
      self.ticker = (self.addr_obj.ticker || ticker || '').toUpperCase();
      self.address = self.addr_obj.address;
      self.title = 'Purchase on Saito Store';
      self.description = '';

      //
      // update UI
      //
      self.render();
      //siteMessage('Deposit request fetched', 1000);

      //
      // start countdown
      //
      if (self.req_obj && Number.isFinite(+self.req_obj.reserved_until)) {
        self.startReservationCountdown(+self.req_obj.reserved_until);
      }

      //
      // poll pending deposit (returns status only)
      //
      //let pollStatus = await self.pollPendingDeposits();

      //
      // if confirmed, save receipt and then fetch receipts
      //
      // if (pollStatus && pollStatus.ok && pollStatus.status === 'confirmed') {
      //   let ack = await self.updatePaymentReceipt({
      //     status: 'pending'
      //   });

      //   if (ack && ack.ok) {
      //     let receipts = await self.fetchPaymentReceipts({
      //       recipient_pubkey: self.mod.publicKey,
      //       limit: 200
      //     });
      //     console.log('Payment receipts after poll:', receipts);
      //   }

      //   //
      //   // return ack
      //   //
      //   return ack || { ok: false, err: 'no_ack' };
      // }

      //
      // return poll result (expired / cancelled / other)
      //
      //return pollStatus;
    } catch (e) {
      console.error('reserve payment callback error:', e);
      salert('error');
      self.purchase_overlay.remove();
      return { ok: false, err: 'exception' };
    }
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

    siteMessage('Crypto payment countdown started....', 1000);

    //
    // prime once immediately and then every second
    //
    tick();
    this.countdown_interval = setInterval(tick, 1000);
    console.log('[countdown] interval started (1s)');
  }

  stopCountDownIterval() {
    if (this.countdown_interval) {
      clearInterval(this.countdown_interval);
      this.countdown_interval = null;
    }
  }

  updatePendingDepositConfirmed(data = {}) {
    this.purchase_overlay.remove();

    salert('Your deposit is confirmed. Sending SAITO to your wallet...');
  }

  updateSaitoIssued(data = {}) {
    this.purchase_overlay.remove();

    salert('Transation to issue SAITO sent. Please wait for network confirmation...');
  }

  reset() {
    //
    // reset values (incase we want to reuse the overlay)
    //
    this.address = '';
    this.ticker = '';
    this.amount = 0;
    this.crypto_selected = false;
    this.tx = null;
    this.saito_amount = 0;
    this.title = '';
    this.description = '';
    this.exchange_rate = '';
    this.addr_obj = {};
    this.req_obj = {};
    this.pool = {};

    //
    // reset countdown timer
    //
    if (this.countdown_interval) {
      clearInterval(this.countdown_interval);
      this.countdown_interval = null;
    }

    //
    // clear any intervals
    //
    this.stopCountDownIterval();
  }
}

module.exports = AssetstoreSaitoPurchaseOverlay;
