const ReceiveTemplate = require('./receive.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');

class Receive {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);

    this.overlay.clickBackdropToClose = false;

    this.counter_party = new SaitoUser(
      this.app,
      this.mod,
      '#receive-crypto-request-container .counterparty-details'
    );

    this.app.connection.on('saito-crypto-receive-render-request', (details) => {
      this.render(details);
    });
    this.app.connection.on('on-nft-received', (obj = {}) => {
      this.processExpectedPayment(obj);
    });
    this.app.connection.on('on-payment-received', (obj = {}) => {
      this.processExpectedPayment(obj);
    });
  }

  processExpectedPayment(obj = {}) {
    if (!this.mod?.game) return;

    const g = this.mod.game;
    const ticker = g.crypto;
    const token = String(obj.sender || obj.sender_publickey || '');
    if (!token) return;
    if (obj.ticker && ticker && obj.ticker !== ticker) return;

    let from = null;
    for (let i = 0; i < g.players.length; i++) {
      const stored = [g.keys?.[i], g.cryptos?.[i + 1]?.[ticker]?.address].filter(Boolean);
      if (g.players[i] === token || stored.some((s) => s.includes(token))) {
        from = g.players[i];
        break;
      }
    }
    if (!from || (this.payer && from !== this.payer)) return;

    let amt = this.app.crypto.convertFloatToSmartPrecision(
      parseFloat(this.expectAmount ?? obj.amount ?? obj.nft_amount ?? 0)
    );
    if (!amt && amt !== 0) return;

    const amtH =
      ticker === 'SAITO' ? this.app.wallet.convertSaitoToNolan(amt).toString() : String(amt);

    const hash = this.app.crypto.hash(
      Buffer.from(from + this.mod.publicKey + amtH + g.dice + ticker, 'utf-8')
    );

    if (this.expectHash && this.expectHash !== hash) return;

    const inbound = this.app.options?.crypto?.[ticker]?.transfers_inbound;
    if (!inbound?.length) return;

    let i = inbound.indexOf(hash);
    if (i < 0 && this.expectHash) i = inbound.indexOf(this.expectHash);
    if (i < 0) return;

    inbound.splice(i, 1);
    this.app.wallet.returnCryptoModuleByTicker(ticker)?.save?.();
    this.onReceivePayment(obj);
  }

  /**
   * Shows a confirmation overlay before initiating a crypto transfer
   * @param ticker { string } - name of a currency
   * @param amount { string } - the amount of crypto
   * @param publicKey { string } - Saito public key of recipient
   * @param address { string } - address of receiver (for currency)
   * @param trusted { boolean } - flag for whether to autoprocess
   * @param mycallback { function} - to run when approved
   *
   */
  render(details) {
    //
    // Verify complete information
    //
    if (!details?.ticker || !details?.amount) {
      console.error('Missing ticker/amount in Receive Crypto Overlay');
      return;
    }

    if (!details?.publicKey || !details?.address) {
      console.error('Missing address in Receive Crypto Overlay');
      return;
    }

    console.log('Show overlay');
    this.overlay.show(ReceiveTemplate(this.app, this.mod, details), () => {
      console.log('&&&&&&&&&&& close overlay -- run call back!!!');
      if (details.mycallback) {
        details.mycallback();
      }
    });

    this.counter_party.publicKey = details.publicKey;

    this.counter_party.render();

    let html = `
			<div class="profile-public-key">
				${details.address.slice(0, 8)}...${details.address.slice(-8)}
            </div>`;

    this.counter_party.updateUserline(html);

    this.attachEvents();

    if (details?.trusted) {
      console.log('Trusted!');
      this.timeout = setTimeout(() => {
        this.overlay.close();
        this.timeout = null;
      }, 3000);
      this.countDown();
    }
  }

  countDown() {
    // Countdown clock
    setTimeout(() => {
      let c = document.querySelector(
        '#receive-crypto-request-container .crypto-transfer-countdown span'
      );
      if (c) {
        let value = parseInt(c.innerHTML);
        value = Math.max(value - 1, 0);
        c.innerHTML = value.toString();
        this.countDown();
      }
    }, 900);
  }

  attachEvents() {
    if (document.getElementById('crypto_receipt_btn')) {
      document.getElementById('crypto_receipt_btn').onclick = (e) => {
        let ignoreBtn = document.querySelector('#ignore_checkbox');
        if (ignoreBtn?.checked) {
          this.mod.saveGamePreference('crypto_transfers_inbound_trusted', 1);
        }
        this.overlay.close();
      };
    }
  }

  onReceivePayment() {
    if (document.getElementById('receive-crypto-request-container')) {
      document.querySelector('.spinner').style.display = 'none';

      document.querySelector('#auth_title').innerHTML = `Received Payment`;
      document.querySelector('#game-crypto-icon').style.display = 'block';

      if (this.timeout) {
        clearTimeout(this.timeout);
        setTimeout(() => {
          this.overlay.close();
          this.timeout = null;
        }, 3000);
        document.querySelector('#receive-crypto-request-container .crypto-transfer-countdown span');
      }
    }
  }
}

module.exports = Receive;
