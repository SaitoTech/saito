const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const CryptoSelectAmountTemplate = require('./select-amount.template');

class CryptoSelectAmount {
  constructor(app, mod, mycallback = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.callback = mycallback;
    this.fixed = true;
    this.ticker = '';
    this.stake = 0;
  }

  render(mycallback = null) {
    if (mycallback != null) {
      this.callback = mycallback;
    }

    this.authorize = true;

    if (!this.ticker) {
      this.ticker = this.app.wallet.returnPreferredCryptoTicker();
    }

    this.overlay.show(CryptoSelectAmountTemplate(this.app, this.mod, this));
    this.overlay.blockClose('#enable_staking_yes');
    this.attachEvents();
  }

  attachEvents() {
    let stake_input = document.getElementById('amount_to_stake_input');
    if (!stake_input) {
      return;
    }

    stake_input.onclick = (e) => {
      if (parseFloat(stake_input.value) == 0) {
        stake_input.select();
      }
    };

    stake_input.onkeydown = (e) => {
      this.app.browser.validateAmountLimit(stake_input.value, e);
    };

    stake_input.onblur = (e) => {
      this.validateAmount();
    };

    stake_input.oninput = (e) => {
      if (document.querySelector('#stake-amount-error').style.display === 'block') {
        this.validateAmount();
      }
    };

    document.querySelector('#enable_staking_yes').onclick = (e) => {
      if (!this.validateAmount() || !this.validateCheckbox()) {
        return;
      }

      if (this.callback != null) {
        this.callback(this.ticker, stake_input.value, null);
      }
      this.overlay.close();
    };

    if (document.querySelector('#stake-select-crypto')) {
      document.querySelector('#stake-select-crypto').onchange = async (e) => {
        this.stake = stake_input.value;
        this.authorize = document.getElementById('crypto-stake-confirm-input')?.checked;
        this.ticker = e.target.value;

        if (!this.mod.balances[this.ticker]) {
          const cm = this.app.wallet.returnCryptoModuleByTicker(this.ticker);
          if (cm) {
            let balance = await cm.getAvailableBalance();
            this.mod.balances[this.ticker] = {
              address: cm.formatAddress(),
              balance
            };
          } else {
            this.mod.balances[this.ticker] = { address: '', balance: '0' };
          }
        }

        this.mod.max_balance = parseFloat(this.mod.balances[this.ticker]?.balance) || 0;
        this.app.browser.replaceElementById(
          CryptoSelectAmountTemplate(this.app, this.mod, this),
          'stake-crypto-request-container'
        );
        this.attachEvents();
      };
    }
  }

  validateAmount() {
    let amount = document.getElementById('amount_to_stake_input').value || '0';
    let input_err = document.querySelector('#stake-amount-error');
    let errorMsg = '';

    amount = parseFloat(amount);

    input_err.innerText = '';
    input_err.style.display = 'none';

    if (amount <= 0) {
      errorMsg = 'you need to select a positive value';
    } else if (amount > this.mod.max_balance) {
      if (this.fixed) {
        errorMsg = 'not all the players have that much to stake';
      } else {
        errorMsg = `you don't have that much to stake`;
      }
    }

    if (errorMsg) {
      input_err.innerText = errorMsg;
      input_err.style.display = 'block';
      return false;
    }

    return true;
  }

  validateCheckbox() {
    let confirm = document.getElementById('crypto-stake-confirm-input').checked;
    let checkbox_err = document.querySelector('#stake-checkbox-error');

    checkbox_err.innerText = '';
    checkbox_err.style.display = 'none';

    if (!confirm) {
      checkbox_err.innerText = 'you need to confirm';
      checkbox_err.style.display = 'block';
      return false;
    }

    return true;
  }
}

module.exports = CryptoSelectAmount;
