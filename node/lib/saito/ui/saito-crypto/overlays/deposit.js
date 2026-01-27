const DepositTemplate = require('./deposit.template');
const PendingDepositTemplate = require('./deposit-polling.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class Deposit {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);

    this.local_dev = mod?.local_dev || false;

    app.connection.on('saito-crypto-deposit-render-request', async (obj) => {
      this.local_dev = mod?.local_dev || false;
      if (this.local_dev) {
        console.info('Deposit overlay moves into local test mode...');
      }

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

    app.connection.on('saito-crypto-deposit-poll-pending', (obj = null) => {
      if (obj) {
        this.ticker = obj.ticker || this.app.wallet.returnPreferredCryptoTicker();
        this.address = obj.address || this.app.wallet.returnCryptoAddressByTicker(this.ticker);
        this.callback = obj.callback || null;
      }

      let ticker = this.migration ? '' : this.ticker;
      this.overlay.show(PendingDepositTemplate(ticker));

      if (this.migration) {
        this.overlay.blockClose();
      }

      this.pollPendingDeposit();
    });

    this.messages = [
      'this is taking a while',
      'hang in there',
      'it will come through eventually',
      'please remain on the line'
    ];
    this.gifs = [
      'https://media4.giphy.com/media/mlvseq9yvZhba/giphy.gif?cid=2dedbeb5qwxjlsbfbb6hoegrqhuuk3jyox9114xh67d5n26b&ep=v1_gifs_search&rid=giphy.gif&ct=g',
      'https://media3.giphy.com/media/nR4L10XlJcSeQ/giphy.gif?cid=2dedbeb5qwxjlsbfbb6hoegrqhuuk3jyox9114xh67d5n26b&ep=v1_gifs_search&rid=giphy.gif&ct=g',
      'https://media2.giphy.com/media/5i7umUqAOYYEw/giphy.gif?cid=2dedbeb5qwxjlsbfbb6hoegrqhuuk3jyox9114xh67d5n26b&ep=v1_gifs_search&rid=giphy.gif&ct=g',
      'https://media4.giphy.com/media/ND6xkVPaj8tHO/giphy.gif?cid=2dedbeb5zv19d51h53z7kixbzxbyecof4okksa5gllpv0pxr&ep=v1_gifs_search&rid=giphy.gif&ct=g',
      'https://media1.giphy.com/media/YBsd8wdchmxqg/giphy.gif?cid=2dedbeb5zv19d51h53z7kixbzxbyecof4okksa5gllpv0pxr&ep=v1_gifs_search&rid=giphy.gif&ct=g'
    ];
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
        this.app.connection.emit('saito-crypto-deposit-poll-pending');
      };
    }
  }

  async renderCrypto() {
    try {
      let cryptomod = this.app.wallet.returnCryptoModuleByTicker(this.ticker);

      await cryptomod.checkBalance();
      this.balance = Number(cryptomod.returnBalance());

      if (document.querySelector(`#saito-deposit-form .balance-amount`)) {
        document.querySelector(`#saito-deposit-form .balance-amount`).innerHTML =
          this.app.browser.returnBalanceHTML(this.balance);
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

  pollPendingDeposit() {
    console.log('Crypto Deposit: poll pending deposit...., current balance: ', this.balance);

    this.overlay.blockClose();
    const cryptomod = this.app.wallet.returnCryptoModuleByTicker(this.ticker);

    let confs = cryptomod.confirmations;
    let ct = 0;
    let interval = setInterval(() => {
      cryptomod.checkBalance();
      cryptomod.fetchPendingDeposits((res) => {
        if (res.length > 0) {
          let pending = res.pop();
          ct = pending.confirmations;
          let amount = Number(pending.amount);
          if (amount > 0) {
            console.log(`${amount} deposit pending (${ct}/${confs})`);
          }
        }
        if (this.local_dev) {
          ct += 2;
        }

        if (document.querySelector('.saito-progress-meter')) {
          document.querySelector('.saito-progress-meter .file-transfer-progress').style.width =
            `${(100 * ct) / confs}%`;
        }
      });

      if (ct % 2 == 0 && ct > 0) {
        let html = `<div>${this.messages[Math.floor(this.messages.length * Math.random())]}</div>`;
        html += `<img class="img-prev" src="${this.gifs[Math.floor(this.gifs.length * Math.random())]}"/>`;
        document.querySelector('.saito-crypto-deposit-content').innerHTML = html;
      }

      let new_balance = Number(cryptomod.returnBalance());

      if (this.local_dev && ct > 8) {
        new_balance = 100000 * Math.random();
        new_balance = Number(new_balance.toFixed(8));
      }

      if (new_balance > this.balance) {
        clearInterval(interval);
        if (this.callback) {
          this.overlay.remove();
          this.callback();
        }
      }
    }, 4250);
  }
}

module.exports = Deposit;
