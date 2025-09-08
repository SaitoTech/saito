const DepositTemplate = require('./deposit.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class Deposit {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);

    app.connection.on('saito-crypto-deposit-render-request', async (obj) => {
      // Cache these to fill in the overlay
      this.title = obj.title || 'Top up wallet';
      this.ticker = obj.ticker || this.app.wallet.returnPreferredCryptoTicker();

      this.address = obj.address || this.app.wallet.returnCryptoAddressByTicker(this.ticker);

      this.desired_amount = obj.amount || null;
      this.migration = obj.migration || false;
      this.warning = obj.warning || null;
      this.callback = obj.callback || null;

      this.render();
    });
  }

  async render() {
    this.overlay.show(DepositTemplate(this.app, this.mod, this));
    this.renderCrypto();
    this.attachEvents();
  }

  attachEvents() {
    document.querySelector('#saito-deposit-form .pubkey-containter').onclick = (e) => {
      navigator.clipboard.writeText(this.address);
      let icon_element = document.querySelector('#saito-deposit-form .pubkey-containter i');
      icon_element.classList.toggle('fa-copy');
      icon_element.classList.toggle('fa-check');
      setTimeout(() => {
        icon_element.classList.toggle('fa-copy');
        icon_element.classList.toggle('fa-check');
      }, 800);
    };

    if (document.getElementById('submit')) {
      document.getElementById('submit').onclick = () => {
        this.overlay.remove();
        if (this.callback) {
          this.callback();
        }
      };
    }
  }

  async renderCrypto() {
    try {
      let cryptomod = this.app.wallet.returnCryptoModuleByTicker(this.ticker);

      if (document.querySelector(`#saito-deposit-form .balance-amount`)) {
        await cryptomod.checkBalance();
        let balance = cryptomod.returnBalance();

        document.querySelector(`#saito-deposit-form .balance-amount`).innerHTML =
          this.app.browser.returnBalanceHTML(balance);
      }

      if (cryptomod?.confirmations) {
        document.querySelector('.network-confirmations-count').innerHTML = cryptomod.confirmations;
      } else {
        document.querySelector('.network-confirmations').style.display = 'none';
      }

      console.log('GEN QR 1: ' + this.address);
      this.app.browser.generateQRCode(this.address, 'deposit-qrcode');
      console.log('GEN QR 2');
    } catch (err) {
      console.log('Error rendering crypto header: ' + err);
    }
  }
}

module.exports = Deposit;
