const DetailsTemplate = require('./details.template');
const SaitoTokenOverlay = require('./saito-acquisition.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoLoader = require('./../../saito-loader/saito-loader');

class Details {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.overlay.class = 'saito-overlay bottom-mobile-overlay';
    this.loader = new SaitoLoader(this.app, this.mod, '#saito-details-loader');

    app.connection.on('saito-crypto-details-render-request', (ticker) => {
      this.ticker = ticker || app.wallet.returnPreferredCryptoTicker();

      this.mod = this.app.wallet.returnCryptoModuleByTicker(this.ticker);
      this.render();

      this.mod.startPolling();
    });

    app.connection.on('saito-crypto-activated', (ticker) => {
      if (ticker == this.ticker && this.overlay.visible) {
        this.render();
      }
    });

    app.connection.on('on-transaction-pending', async (obj = null) => {
      if (this.overlay.visible) {
        await this.updateBalances();
        this.formatHistory();
      }
    });

    app.connection.on('on-payment-sent', async (obj = null) => {
      if (this.overlay.visible) {
        await this.updateBalances();
        this.formatHistory();
      }
    });

    app.connection.on('on-payment-received', async (obj = null) => {
      if (this.overlay.visible) {
        await this.updateBalances();
        this.formatHistory();
      }
    });
  }

  render(qrcode_html = '') {
    this.overlay.show(DetailsTemplate(this.app, this.mod), () => {
      this.mod.stopPolling();
    });

    this.updateBalances();

    // Insert deposit QR code
    if (document.getElementById('qrcode2')) {
      if (qrcode_html) {
        document.querySelector('#qrcode2').innerHTML = qrcode_html;
      } else {
        document.querySelector('#qrcode2').style.visibility = 'hidden';
        document.querySelector('#qrcode2').style.opacity = '0';

        document.querySelector('#qrcode2').innerHTML = '';
        this.app.browser.generateQRCode(this.mod.address, 'qrcode2');
        this.app.browser.addElementToId(
          `<div class="crypto-api-fetch-spinner"><i class='fa-solid fa-spin fa-arrows-rotate'/></div>`,
          'qrcode2'
        );
        setTimeout(() => {
          document.querySelector('#qrcode2').removeAttribute('style');
        }, 100);
      }
    }

    setTimeout(async () => {
      let balance = await this.app.wallet.getBalance();
      if (Number(balance) == 0 && document.querySelector('.get-saito-tokens')) {
        this.app.modules.renderInto('.get-saito-tokens');
      }
    }, 0);

    this.loader.remove();

    this.formatHistory();

    this.attachEvents();
  }

  async updateBalances() {
    let available_balance = await this.mod.getAvailableBalance();
    let pending_balance = await this.mod.getPendingBalance();
    let available_balance_num = Number(available_balance);
    let pending_balance_num = Number(pending_balance);

    let html = '';

    if (pending_balance_num !== available_balance_num) {
      html += `
                <div class="label">Pending Balance:</div>
                <div class="balance-amount">${this.app.browser.returnBalanceHTML(pending_balance, true)}</div>
              
    `;
    } else {
      html += `
                <div class="label">Available Balance:</div>
                <div class="balance-amount">${this.app.browser.returnBalanceHTML(available_balance, true)}</div>
              </div>
    `;
    }

    let balance_handle = document.querySelector('.main-balance');
    if (balance_handle) {
      balance_handle.innerHTML = html;
    }

    let send_btn = document.getElementById('send-crypto');
    if (send_btn) {
      if (pending_balance_num > 0 || available_balance_num > 0) {
        send_btn.removeAttribute('disabled');
      } else {
        send_btn.setAttribute('disabled', false);
      }
    }
  }

  formatHistory() {
    let history_html = `
          <div class="transaction-history-table saitox-table" data-crypto="${this.mod.ticker}">
            <div class="saitox-header-item">Time</div>
            <div class="saitox-header-item">Type</div>
            <div class="saitox-header-item">Amount</div>
            <div class="saitox-header-item">Balance</div>
            <div class="saitox-header-item">To/From</div>
            <div class="saitox-header-item saito-only">Memo</div>
    `;
    let running_balance = Number(this.mod.returnBalance());

    if (this.ticker == 'SAITO') {
      document.documentElement.style.setProperty('--saitox-column-ct', 6);
    } else {
      document.documentElement.style.setProperty('--saitox-column-ct', 5);
    }

    if (!this.mod.history?.length && running_balance == 0) {
      console.log('No history to format or interpolate');
      return;
    }

    let day = new Date().toDateString();
    let last_ts = 0;

    if (this.mod.history?.length > 0) {
      console.log('Formatting HISTORY: ', this.mod.history);

      // insert a filler line for a pending balance change...
      if (this.mod.pending_balance) {
        let diff = Number(this.mod.pending_balance) - Number(this.mod.last_balance);
        history_html += `<div class="crypto-timestamp"></div>
                          <div class="crypto-type-italic">Pending</div>
                          <div class="crypto-amount">${this.app.browser.formatDecimals(diff)}</div>
                          <div class="crypto-amount">${this.app.browser.formatDecimals(this.mod.pending_balance)}</div>
                          <div></div>
                          <div class="saito-only"></div>`;

        running_balance -= diff;
        running_balance = Number(running_balance.toFixed(8));
      }

      // Go backwards in time
      for (let i = this.mod.history.length - 1; i >= 0; i--) {
        let h = this.mod.history[i];

        if (h.timestamp == last_ts) {
          console.warn('Duplicate entries!');
          continue;
        }

        last_ts = h.timestamp;
        let ts = new Date(h.timestamp);

        let inner_html = '';
        if (ts.toDateString() !== day) {
          day = ts.toDateString();
          inner_html += `<div class="saitox-table-break">${day}</div>`;
        }

        inner_html += `<div class="crypto-timestamp">${ts.toLocaleTimeString()}</div>
                          <div class="crypto-type">${h.type}</div>
                          <div class="crypto-amount">${this.app.browser.formatDecimals(h.amount)}</div>
                          <div class="crypto-amount">${this.app.browser.formatDecimals(running_balance)}</div>`;

        if (h.counter_party?.publicKey) {
          inner_html += this.app.browser.returnAddressHTML(h.counter_party.publicKey);
        } else if (h.counter_party?.address) {
          if (h.counter_party.address.indexOf('-') > 0) {
            let mixin_address = h.counter_party.address.split('-');
            inner_html += `<div class="crypto-address" title="mixin internal address">${mixin_address[0]}--${mixin_address[mixin_address.length - 1]}</div>`;
          } else {
            inner_html += `<div class="crypto-address" data-address="${h.counter_party.address}">${h.counter_party.address.slice(0, 6)}...${h.counter_party.address.slice(-8)}</div>`;
          }
        } else {
          inner_html += '<div></div>';
        }
        inner_html += `<div class="saito-only">${h?.memo || ''}</div>`;

        history_html += inner_html;

        //
        // Round off to correct any crazy float operations bullshit
        //
        running_balance -= Number(h.amount);
        running_balance = Number(running_balance.toFixed(8));
      }
    }

    if (running_balance > 0) {
      history_html += `<div class="crypto-timestamp"></div>
                          <div class="crypto-type">deposit</div>
                          <div class="crypto-amount">${this.app.browser.formatDecimals(running_balance)}</div>
                          <div class="crypto-amount">${this.app.browser.formatDecimals(running_balance)}</div>
                          <div class="crypto-address">Starting balance</div>
                          `;
    }

    history_html += '</div>';

    this.app.browser.replaceElementBySelector(
      history_html,
      '.transaction-history-table.saitox-table'
    );
  }

  attachEvents() {
    if (document.getElementById('activate-now')) {
      document.getElementById('activate-now').onclick = (e) => {
        this.loader.render();
        this.app.wallet.setPreferredCrypto(this.ticker);
      };
    }

    Array.from(document.querySelectorAll('.pubkey-container')).forEach(
      (element) =>
        (element.onclick = async (e) => {
          let public_key = document.getElementById('profile-public-key').dataset.add;

          await navigator.clipboard.writeText(public_key);
          let icon_element = element.querySelector('i.fa-copy');
          icon_element.classList.toggle('fa-copy');
          icon_element.classList.toggle('fa-check');

          setTimeout(() => {
            icon_element.classList.toggle('fa-copy');
            icon_element.classList.toggle('fa-check');
          }, 800);
        })
    );

    if (document.getElementById('send-crypto')) {
      document.getElementById('send-crypto').onclick = (e) => {
        console.log('Click to send:', this.mod.balance, this.mod.returnBalance());
        if (Number(this.mod.balance) > 0) {
          this.app.connection.emit('saito-crypto-withdraw-render-request', { ticker: this.ticker });
        }
      };
    }

    if (document.getElementById('get-saito')) {
      document.getElementById('get-saito').onclick = (e) => {
        this.app.connection.emit('saito-purchase-launch');
        //let overlay = new SaitoOverlay(this.app, this.mod);
        //overlay.show(SaitoTokenOverlay());
      };
    }

    if (document.getElementById('fetch-history')) {
      document.getElementById('fetch-history').onclick = (e) => {
        this.mod.fetchHistory(0, () => {
          this.formatHistory();
        });
      };
    }
  }
}

module.exports = Details;
