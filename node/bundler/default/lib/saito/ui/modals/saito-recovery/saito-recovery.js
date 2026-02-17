const KeyTemplate = require('./keyentry.template');
const PhraseTemplate = require('./phraseentry.template');
const PasswordTemplate = require('./passwordentry.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class SaitoRecover {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    this.modal_overlay = new SaitoOverlay(this.app, this.mod);
  }

  render(mode = 'key') {
    if (mode == 'key') {
      this.modal_overlay.show(KeyTemplate());
    } else {
      this.modal_overlay.show(PhraseTemplate());
    }

    document.querySelector('.saito-overlay-form-input').focus();

    this.attachEvents();
  }

  attachEvents() {
    if (document.getElementById('private-key-submit')) {
      document.getElementById('private-key-submit').onclick = (e) => {
        let privatekey = document.getElementById('private-key-input').value;
        this.loadPrivateKey(privatekey);
      };
    }

    if (document.getElementById('seed-phrase-submit')) {
      document.getElementById('seed-phrase-submit').onclick = (e) => {
        let seedPhrase = document.getElementById('seed-phrase-input').value;
        let privatekey = this.app.crypto.getPrivateKeyFromSeed(seedPhrase);
        this.loadPrivateKey(privatekey);
      };
    }

    if (document.getElementById('input-seed-phrase')) {
      document.getElementById('input-seed-phrase').onclick = () => {
        this.render('phrase');
      };
    }

    if (document.getElementById('input-private-key')) {
      document.getElementById('input-private-key').onclick = () => {
        this.render('key');
      };
    }
  }

  loadFile() {
    if (!document.getElementById('file-input')) {
      this.app.browser.addElementToDom(
        `<input id="file-input" class="file-input" type="file" accept=".json, .aes" style="display:none;" />`
      );
    }

    let this_self = this;

    document.getElementById('file-input').addEventListener(
      'change',
      async function (e) {
        var file = e.target.files[0];

        let wallet_reader = new FileReader();
        wallet_reader.readAsBinaryString(file);
        wallet_reader.onloadend = async () => {
          let wallet = wallet_reader.result.toString();

          if (this_self.app.crypto.isAesEncrypted(wallet)) {
            this_self.modal_overlay.show(PasswordTemplate());
            document.querySelector('#wallet-decryption-submit').onclick = (e) => {
              let email = document.querySelector('.saito-overlay-form-email').value;
              let password = document.querySelector('.saito-overlay-form-password').value;

              let hash1 = 'WHENINDISGRACEWITHFORTUNEANDMENSEYESIALLALONEBEWEEPMYOUTCASTSTATE';
              let hash2 = 'ANDTROUBLEDEAFHEAVENWITHMYBOOTLESSCRIESANDLOOKUPONMYSELFANDCURSEMYFATE';

              let decryption_secret = this_self.app.crypto.hash(
                this_self.app.crypto.hash(email + password) + hash1
              );
              try {
                let decrypted_wallet = this_self.app.crypto.aesDecrypt(wallet, decryption_secret);
                this_self.installWallet(decrypted_wallet);
              } catch (err) {
                salert('Invalid email and/or password');
              }
            };
          } else {
            await this_self.installWallet(wallet);
          }
        };
      },
      { once: true }
    );

    document.getElementById('file-input').click();
  }

  async installWallet(wallet) {
    try {
      let result = await this.app.wallet.onUpgrade('import', '', wallet);

      if (result === true) {
        let c = await sconfirm('Success! Confirm to reload');
        if (c) {
          reloadWindow(300);
        }
      } else {
        salert('Error installing wallet');
        console.error(result);
      }
    } catch (err) {
      console.err('Install Wallet ERROR: ', err);
      salert('Unable to install wallet');
    }
  }

  async loadPrivateKey(privatekey) {
    if (privatekey) {
      try {
        let result = await this.app.wallet.onUpgrade('import', privatekey);

        if (result === true) {
          let c = await sconfirm('Success! Confirm to reload');
          if (c) {
            reloadWindow(300);
          }
        } else {
          let err = result;
          salert('Something went wrong: ' + err.name);
        }
      } catch (e) {
        salert('Restore Private Key ERROR: <br> ' + e);
        console.error('Restore Private Key ERROR: ' + e);
      }
    }
  }
}

module.exports = SaitoRecover;
