const MigrationMainTemplate = require('./main.template');

class MigrationMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  async render() {
    if (document.querySelector('.main')) {
      this.app.browser.replaceElementBySelector(MigrationMainTemplate(this.mod), '.main');
    } else {
      this.app.browser.addElementToDom(MigrationMainTemplate(this.mod));
    }
    this.attachEvents();
  }

  attachEvents() {
    const button = document.querySelector('#migrate');
    if (!button) {
      return;
    }
    const tickerSelect = document.querySelector('#wrapped-saito-ticker');
    const chainInput = document.querySelector('#erc20');
    const syncAddressPlaceholder = () => {
      if (!chainInput || !tickerSelect) {
        return;
      }
      chainInput.placeholder = tickerSelect.value === 'BEP-SAITO' ? 'BSC address' : 'ETH address';
    };
    tickerSelect?.addEventListener('change', syncAddressPlaceholder);

    button.onclick = async () => {
      const publickey = document.querySelector('#publickey')?.value?.trim() || '';
      const chainAddress = document.querySelector('#erc20')?.value?.trim() || '';
      const email = document.querySelector('#email')?.value?.trim() || '';
      const ticker = document.querySelector('#wrapped-saito-ticker')?.value || 'ERC-SAITO';

      if (!publickey) {
        salert('Enter the Saito address that should receive the tokens.');
        return;
      }
      if (publickey !== this.mod.publicKey) {
        salert(
          'The publickey provided is not the publickey of this wallet. To avoid problems please request token withdrawal from the wallet which will receive the tokens'
        );
        return;
      }
      if (!/^0x[a-fA-F0-9]{40}$/i.test(chainAddress)) {
        salert('Enter the Ethereum or BSC address that will send the wrapped SAITO.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        salert('Enter an email address for migration notifications.');
        return;
      }
      if (ticker !== 'ERC-SAITO' && ticker !== 'BEP-SAITO') {
        salert('Select ERC20 SAITO or BEP20 SAITO.');
        return;
      }

      button.disabled = true;
      try {
        const response = await this.mod.requestMigration({
          publickey,
          chain_address: chainAddress,
          email,
          ticker
        });
        this.mod.wrapped_saito_ticker = ticker;
        this.mod.receiveMigrationInstructions(response);
      } catch (err) {
        salert(err?.message || 'Migration request failed');
        button.disabled = false;
      }
    };
  }
}

module.exports = MigrationMain;
