const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const AdjustStakeTemplate = require('./adjust-stake.template');

class AdjustStake {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  bindSelectOnZeroFocus(input) {
    if (!input) {
      return;
    }

    const selectIfZero = () => {
      if (parseFloat(input.value) === 0) {
        input.select();
      }
    };

    input.addEventListener('focus', selectIfZero);
    input.addEventListener('click', selectIfZero);
  }

  async render(obj) {
    if (obj?.accept_callback) {
      this.accept_callback = obj.accept_callback;
    }
    if (obj?.reject_callback) {
      this.reject_callback = obj.reject_callback;
    }

    this.min_stake = parseFloat(obj.stake.min);
    this.match_stake = this.min_stake;

    let current_balance = Number(await this.app.wallet.returnPreferredCryptoBalance());

    this.max_stake = current_balance;

    for (let i in obj.stake) {
      if (parseFloat(obj.stake[i]) > this.match_stake) {
        this.match_stake = parseFloat(obj.stake[i]);
      }
    }

    if (obj.game_mod?.opengame) {
      this.max_stake = Math.min(current_balance, this.match_stake);
    }

    this.ticker = obj.ticker;

    this.overlay.show(AdjustStakeTemplate(this.app, this), this.reject_callback);
    this.overlay.blockClose('#enable_staking_yes');
    this.attachEvents();
  }

  attachEvents() {
    let stake_input = document.getElementById('amount_to_stake_input');
    if (!stake_input) {
      return;
    }

    this.bindSelectOnZeroFocus(stake_input);

    let match_button = document.querySelector('.select_match');
    if (match_button && !match_button.classList.contains('nomatch')) {
      match_button.onclick = (e) => {
        stake_input.value = this.match_stake;
      };
    }

    let min_button = document.querySelector('.select_min');
    if (min_button) {
      min_button.onclick = (e) => {
        stake_input.value = this.min_stake;
      };
    }

    let max_button = document.querySelector('.select_max');
    if (max_button) {
      max_button.onclick = (e) => {
        stake_input.value = this.max_stake;
      };
    }

    stake_input.onkeydown = (e) => {
      this.app.browser.validateAmountLimit(stake_input.value, e);
    };

    stake_input.oninput = (e) => {
      this.validateAmount();
    };

    document.querySelector('#enable_staking_yes').onclick = (e) => {
      if (!this.validateAmount()) {
        return;
      }

      if (this.accept_callback) {
        this.accept_callback(parseFloat(stake_input.value));
      }
      this.overlay.close();
    };

    document.querySelector('#enable_staking_no').onclick = (e) => {
      if (this.reject_callback) {
        this.reject_callback();
      }
      this.overlay.close();
    };
  }

  validateAmount() {
    let amount = document.getElementById('amount_to_stake_input').value;
    let input_err = document.querySelector('#stake-amount-error');
    let errorMsg = '';

    amount = parseFloat(amount);

    input_err.innerText = '';
    input_err.style.display = 'none';

    if (amount < 0) {
      errorMsg = 'You need to select a non-negative value';
    } else if (amount > this.max_stake) {
      errorMsg = `You don't have that much to stake`;
    } else if (amount < this.min_stake) {
      errorMsg = `You need to stake at least ${this.min_stake}`;
    }

    if (errorMsg) {
      input_err.innerText = errorMsg;
      input_err.style.display = 'block';
      this.mod.validateBalance(amount, this.ticker);
      return false;
    }

    return true;
  }
}

module.exports = AdjustStake;
