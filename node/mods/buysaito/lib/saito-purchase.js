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
    this.address = '';
    this.ticker = '';
    this.amount = 0;
    this.crypto_selected = false;
    this.tx = null;
    this.saito_amount = 0;
    this.title = '';
    this.description = '';
    this.deposit_confirmed = false;

    this.addr_obj = {}; // { id, ticker, address, asset_id, chain_id, created_at, reserved_until, reserved_by }
    this.req_obj = {}; // { id, reserved_until, remaining_minutes, expected_amount }
    this.pool = {}; // { ticker, total, limit }

    this.countdown_interval = null;
    this.pending_interval = null;

    this.ui_msg = '';

    this.available_currencies = [];

    app.connection.on('saito-purchase-pending-deposit-confirmed', async (data) => {
      this.updatePendingDepositConfirmed(data);
    });

    app.connection.on('saito-purchase-saito-issued', async (data) => {
      this.updateSaitoIssued(data);
    });

    app.connection.on('saito-purchase-launch', (amount, tx = null) => {
      this.reset();
      this.amount = Number(amount);

      // Render immediately if we already have the data
      if (this.available_currencies?.length) {
        this.render();
        return;
      }

      // More complicated but smoother transition while fetching info
      this.overlay.show(SaitoPurchaseLoaderTemplate('Checking availability...'));
      setTimeout(async () => {
        if (!tx) {
          this.tx = await this.mod.createBuySaitoTransaction();
        }

        await this.loadAvailableCryptos();
        if (this.available_currencies?.length) {
          for (let c of this.available_currencies) {
            if (c.ticker == 'ERC-SAITO') {
              this.mod.erc_saito = c;
            }
          }
          setTimeout(() => {
            this.render();
          }, 2000);
        } else {
          this.overlay.remove();
        }
      }, 50);
    });
  }

  async render() {
    console.log('render saito-purchase');
    let self = this;
    this.overlay.remove();

    if (!this.crypto_selected) {
      //
      // 1. user selects crypto
      //
      this.overlay.show(SaitoPurchaseCryptoTemplate(this.app, this.mod, this));
    } else {
      if (!this.address) {
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
          this.app.browser.generateQRCode(this.address, 'pqrcode');
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
        for (let i = 0; i < this.available_currencies.length; i++) {
          if (this.available_currencies[i].ticker == e.currentTarget.id)
            this.crypto_selected = this.available_currencies[i];
        }
        if (!this.crypto_selected) {
          salert('Error reading crypto selection');
          return;
        }
        this.overlay.show(SaitoPurchaseLoaderTemplate('Requesting Payment Instructions...'));
        this.requestPaymentAddressFromServer();
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
    console.log('loadAvailableCryptos -> request');

    if (!this.mod.mixin_peer) {
      console.warn('No mixin peer available to handle purchases');
      salert('No mixin peer available to handle purchases');
      return 0;
    }

    if (this.available_currencies?.length == 0) {
      await this.app.network.sendRequestAsTransaction(
        'mixin available cryptos',
        null,
        (res) => {
          console.log('Callback in loadAvailableCryptos: ', res);

          if (res?.err) {
            this.available_currencies = null;
            console.warn('Peer request error: ', res.err);
            return null;
          }

          if (this.mod.acceptable_currencies === '*') {
            this.available_currencies = res;
          } else {
            for (let i = 0; i < res.length; i++) {
              if (this.mod.acceptable_currencies.includes(res[i].ticker)) {
                this.available_currencies.push(res[i]);
              }
            }
          }
        },
        this.mod.mixin_peer.peerIndex
      );
    }

    return this.available_currencies;
  }

  //
  // reserve address -> poll pending deposit -> fetch receipts
  //
  async requestPaymentAddressFromServer() {
    let self = this;

    let converted_amount = this.mod.convertToSaito(this.amount, this.crypto_selected.price_usd);

    //
    // build request payload
    //
    let data = {
      publickey: this.mod.publicKey,
      expected_amount: converted_amount, // ticker amount
      issue_amount: this.amount, // saito amount
      minutes: 30,
      ticker: this.crypto_selected.ticker,
      tx: this.tx.serialize_to_web(self.app)
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
        self.overlay.remove();
        return { ok: false, err: msg };
      }

      //
      // reserve address success — extract info
      //
      self.addr_obj = res.address; // { id, ticker, address, asset_id, chain_id, ... }
      self.req_obj = res.request; // { id, reserved_until, remaining_minutes, expected_amount }
      self.pool = res.pool; // { ticker, total, limit }

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
      self.overlay.remove();
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

  updatePendingDepositConfirmed(data = {}) {
    this.overlay.remove();

    salert('Your deposit is confirmed. Sending SAITO to your wallet...');
  }

  updateSaitoIssued(data = {}) {
    this.overlay.remove();

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
  }
}

module.exports = SaitoPurchaseOverlay;
