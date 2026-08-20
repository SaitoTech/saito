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
    this.one_sided = false;
    this.player1_stake = '0';
    this.player2_stake = '0';
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

  render(mycallback = null) {
    if (mycallback != null) {
      this.callback = mycallback;
    }

    if (!this.ticker) {
      this.ticker = this.app.wallet.returnPreferredCryptoTicker();
    }

    this.overlay.show(CryptoSelectAmountTemplate(this.app, this.mod, this));
    this.overlay.blockClose('#enable_staking_yes');
    this.attachEvents();
  }

  refreshForm() {
    this.app.browser.replaceElementById(
      CryptoSelectAmountTemplate(this.app, this.mod, this),
      'stake-crypto-request-container'
    );
    this.attachEvents();
  }

  attachEvents() {
    const toggle = document.getElementById('stake-mode-toggle');
    if (toggle) {
      toggle.onclick = (e) => {
        e.preventDefault();
        this.toggleStakeMode();
      };
    }

    const stake_input = document.getElementById('amount_to_stake_input');
    if (stake_input) {
      this.bindSelectOnZeroFocus(stake_input);
      stake_input.onkeydown = (e) => {
        this.app.browser.validateAmountLimit(stake_input.value, e);
      };
      stake_input.onblur = () => {
        this.validateAmount();
      };
      stake_input.oninput = () => {
        if (document.querySelector('#stake-amount-error')?.style.display === 'block') {
          this.validateAmount();
        }
      };
    }

    const player1_input = document.getElementById('player1_stake_input');
    const player2_input = document.getElementById('player2_stake_input');
    if (player1_input) {
      this.bindSelectOnZeroFocus(player1_input);
      player1_input.onkeydown = (e) => {
        this.app.browser.validateAmountLimit(player1_input.value, e);
      };
      player1_input.onblur = () => {
        this.validateAmount();
      };
      player1_input.oninput = () => {
        if (document.querySelector('#stake-amount-error')?.style.display === 'block') {
          this.validateAmount();
        }
      };
    }
    if (player2_input) {
      this.bindSelectOnZeroFocus(player2_input);
      player2_input.onkeydown = (e) => {
        this.app.browser.validateAmountLimit(player2_input.value, e);
      };
      player2_input.onblur = () => {
        this.validateAmount();
      };
      player2_input.oninput = () => {
        if (document.querySelector('#stake-amount-error')?.style.display === 'block') {
          this.validateAmount();
        }
      };
    }

    const confirm_btn = document.querySelector('#enable_staking_yes');
    if (confirm_btn) {
      confirm_btn.onclick = () => {
        if (!this.validateAmount()) {
          return;
        }

        if (this.callback != null) {
          if (this.one_sided) {
            const p1 = document.getElementById('player1_stake_input')?.value ?? this.player1_stake;
            const p2 = document.getElementById('player2_stake_input')?.value ?? this.player2_stake;
            this.callback(this.ticker, p1, p2);
          } else {
            const amount = document.getElementById('amount_to_stake_input')?.value ?? this.stake;
            this.callback(this.ticker, amount, null);
          }
        }
        this.overlay.close();
      };
    }

    const crypto_select = document.querySelector('#stake-select-crypto');
    if (crypto_select) {
      crypto_select.onchange = async (e) => {
        this.captureInputValues();
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
        this.refreshForm();
      };
    }
  }

  captureInputValues() {
    if (this.one_sided) {
      this.player1_stake = document.getElementById('player1_stake_input')?.value ?? this.player1_stake;
      this.player2_stake = document.getElementById('player2_stake_input')?.value ?? this.player2_stake;
    } else {
      this.stake = document.getElementById('amount_to_stake_input')?.value ?? this.stake;
    }
  }

  toggleStakeMode() {
    this.captureInputValues();

    if (!this.one_sided) {
      this.player1_stake = document.getElementById('amount_to_stake_input')?.value || this.stake || '0';
      if (this.player2_stake === undefined || this.player2_stake === '') {
        this.player2_stake = '0';
      }
      this.one_sided = true;
    } else {
      this.stake = document.getElementById('player1_stake_input')?.value || this.player1_stake || '0';
      this.one_sided = false;
    }

    this.refreshForm();
  }

  validateAmount() {
    let input_err = document.querySelector('#stake-amount-error');
    if (!input_err) {
      return true;
    }

    let errorMsg = '';
    input_err.innerText = '';
    input_err.style.display = 'none';

    if (this.one_sided) {
      const p1 = parseFloat(document.getElementById('player1_stake_input')?.value ?? this.player1_stake);
      const p2 = parseFloat(document.getElementById('player2_stake_input')?.value ?? this.player2_stake);

      if ((Number.isNaN(p1) || p1 < 0) || (Number.isNaN(p2) || p2 < 0)) {
        errorMsg = 'stakes must be zero or greater';
      } else if (p1 <= 0 && p2 <= 0) {
        errorMsg = 'at least one player needs a stake greater than zero';
      } else if (p1 > this.mod.max_balance) {
        errorMsg = `you don't have that much to stake for player 1`;
      }
    } else {
      let amount = parseFloat(document.getElementById('amount_to_stake_input')?.value ?? this.stake ?? '0');

      if (amount <= 0) {
        errorMsg = 'you need to select a positive value';
      } else if (amount > this.mod.max_balance) {
        if (this.fixed) {
          errorMsg = 'not all the players have that much to stake';
        } else {
          errorMsg = `you don't have that much to stake`;
        }
      }
    }

    if (errorMsg) {
      input_err.innerText = errorMsg;
      input_err.style.display = 'block';
      return false;
    }

    return true;
  }
}

module.exports = CryptoSelectAmount;
