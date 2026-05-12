const WithdrawTemplate = require('./withdraw.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoContacts = require('./../../modals/saito-contacts/saito-contacts');
const SaitoNFT = require('../../saito-nft/saito-nft');

class Withdraw {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.contacts = new SaitoContacts(app, mod);

    this.ticker = '';
    this.pc = null; // pointer at the crypto module
    this.publicKey = '';
    this.fee = null;

    this.errors = {
      amount: false,
      address: false
    };

    this.available_balance = 0;
    /** Raw string balance for NFT withdraw validation (avoids Number precision loss). */
    this._nft_balance_raw = null;

    // We will only programattically input the address if it is a Saito PublicKey
    this.app.connection.on('saito-crypto-withdraw-render-request', async (obj) => {
      this.ticker = obj?.ticker || '';
      this.publicKey = obj?.address || '';

      if (this.ticker) {
        await this.app.wallet.setPreferredCrypto(this.ticker);
      }

      this.render();
    });
  }

  async render() {
    this.pc = this.app.wallet.returnPreferredCrypto();
    this.ticker = this.pc.ticker;
    let destination = '';

    if (this.publicKey) {
      destination = await this.pc.returnAddressFromPublicKey(this.publicKey);
    }

    if (document.getElementById('withdrawal-form')) {
      this.app.browser.replaceElementById(
        WithdrawTemplate(this.app, this.mod, this.publicKey, destination),
        'withdrawal-form'
      );
    } else {
      this.overlay.show(WithdrawTemplate(this.app, this.mod, this.publicKey, destination), () => {
        this.ticker = null;
        this.pc = null;
        this.publicKey = null;
      });
    }

    await this.loadCryptos();

    await this.refreshAvailableBalanceDisplay();

    document
      .querySelectorAll(`#withdraw-logo-cont img[data-ticker="${this.pc.ticker}"]`)
      .forEach((el) => el.classList.remove('hide-element'));

    await this.fetchWithdrawFee();

    this.attachEvents();
  }

  async refreshAvailableBalanceDisplay() {
    const el = document.querySelector('.withdraw-info-value.balance');
    if (!this.pc || !el) {
      return;
    }
    const raw = await this.pc.getAvailableBalance();
    if (this.isNftWithdrawSelection()) {
      this._nft_balance_raw = String(raw).trim();
    } else {
      this._nft_balance_raw = null;
    }
    const n = Number(raw);
    this.available_balance = Number.isFinite(n) ? n : 0;
    el.textContent = this.app.browser.formatDecimals(String(this.available_balance));
  }

  async loadCryptos() {
    const sel = document.getElementById('withdraw-select-crypto');
    const menu = document.getElementById('withdraw-token-menu');
    if (sel) {
      sel.replaceChildren();
    }
    if (menu) {
      menu.replaceChildren();
    }

    let available_cryptos = this.app.wallet.returnActivatedCryptos();

    //
    // Populate hidden select + custom token menu
    //
    for (let crypto_mod of available_cryptos) {
      if (
        !this?.publicKey ||
        (await crypto_mod.returnAddressFromPublicKey(this.publicKey)) !== null
      ) {
        let show_me = crypto_mod.name == this.pc.name;

        let html = `<option ${show_me ? 'selected' : ``} id="crypto-option-${
          crypto_mod.name
        }" value="${crypto_mod.ticker}">${crypto_mod.ticker}</option>`;

        this.app.browser.addElementToId(html, 'withdraw-select-crypto');

        let icons = crypto_mod.returnLogos();

        let img_html = `<img class="crypto-logo hide-element" data-ticker="${crypto_mod.ticker}" src="${icons.img}">`;
        if (icons.sub_logo) {
          img_html += `<img class="chain-logo hide-element" data-ticker="${crypto_mod.ticker}" src="${icons.sub_logo}">`;
        }

        this.app.browser.addElementToId(img_html, 'withdraw-logo-cont');

        if (menu) {
          const li = document.createElement('li');
          li.className = 'withdraw-token-option';
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', show_me ? 'true' : 'false');
          li.dataset.ticker = crypto_mod.ticker;
          let sub = '';
          if (icons.sub_logo) {
            sub = `<img class="withdraw-token-option-chain" src="${icons.sub_logo}" alt="" />`;
          }
          li.innerHTML = `<img class="withdraw-token-option-logo" src="${icons.img}" alt="" />${sub}<span class="withdraw-token-option-ticker">${crypto_mod.ticker}</span>`;
          menu.appendChild(li);
        }
      }
    }
    const triggerTick = document.getElementById('withdraw-token-trigger-ticker');
    if (triggerTick) {
      triggerTick.textContent = this.pc.ticker;
    }
  }

  closeTokenMenu() {
    const menu = document.getElementById('withdraw-token-menu');
    const trigger = document.getElementById('withdraw-token-trigger');
    if (menu) {
      menu.classList.add('hide-element');
    }
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  async selectCryptoTicker(ticker) {
    const balEl = document.querySelector('.withdraw-info-value.balance');
    if (balEl) {
      balEl.textContent = 'fetching...';
    }
    document
      .querySelectorAll(`#withdraw-logo-cont img`)
      .forEach((el) => el.classList.add('hide-element'));

    document
      .querySelectorAll(`#withdraw-logo-cont img[data-ticker="${ticker}"]`)
      .forEach((el) => el.classList.remove('hide-element'));

    await this.app.wallet.setPreferredCrypto(ticker);
    this.fee = null;

    const sel = document.getElementById('withdraw-select-crypto');
    if (sel) {
      sel.value = ticker;
    }
    const triggerTick = document.getElementById('withdraw-token-trigger-ticker');
    if (triggerTick) {
      triggerTick.textContent = ticker;
    }
    document.querySelectorAll('.withdraw-token-option').forEach((li) => {
      li.setAttribute('aria-selected', li.dataset.ticker === ticker ? 'true' : 'false');
    });

    if (this.publicKey) {
      this.closeTokenMenu();
      this.render();
      return;
    }

    document.querySelector('#withdraw-input-address').value = '';
    document.querySelector('#withdraw-input-amount').value = '';
    this.resetErrors();

    this.pc = this.app.wallet.returnPreferredCrypto();
    this.ticker = this.pc.ticker;
    await this.fetchWithdrawFee();

    setTimeout(async () => {
      await this.refreshAvailableBalanceDisplay();
    }, 500);

    this.closeTokenMenu();
  }

  async attachEvents() {
    let this_withdraw = this;

    const trigger = document.getElementById('withdraw-token-trigger');
    const menu = document.getElementById('withdraw-token-menu');
    if (trigger && menu) {
      trigger.onclick = (e) => {
        e.stopPropagation();
        const open = menu.classList.contains('hide-element');
        if (open) {
          menu.classList.remove('hide-element');
          trigger.setAttribute('aria-expanded', 'true');
          setTimeout(() => {
            document.addEventListener(
              'click',
              () => {
                this.closeTokenMenu();
              },
              { once: true }
            );
          }, 0);
        } else {
          this.closeTokenMenu();
        }
      };

      menu.onclick = (e) => {
        const li = e.target.closest('.withdraw-token-option');
        if (!li || !li.dataset.ticker) {
          return;
        }
        e.stopPropagation();
        void this.selectCryptoTicker(li.dataset.ticker);
      };
    }

    const addrInput = document.querySelector('#withdraw-input-address');
    if (addrInput) {
      const clearAddressUi = () => {
        this.clearAddressError();
        this.handleErrors();
      };
      addrInput.onfocus = clearAddressUi;
      addrInput.oninput = clearAddressUi;
      addrInput.onblur = async (e) => {
        this.validateAddressInput();
        await this.fetchWithdrawFee();
      };
    }

    const amtInput = document.querySelector('#withdraw-input-amount');
    if (amtInput) {
      const clearAmountUi = () => {
        this.clearAmountError();
        this.handleErrors();
      };
      amtInput.onfocus = clearAmountUi;
      amtInput.oninput = clearAmountUi;
      amtInput.onblur = (e) => {
        this.validateAmountInput();
      };

      // Prevent entering non-numeric values...
      amtInput.onchange = (e) => {
        let amount = document.querySelector('#withdraw-input-amount').value;
        this.app.browser.validateAmountLimit(amount, e);
      };
    }

    if (document.querySelector('#withdrawal-form') != null) {
      document.querySelector('#withdrawal-form').onsubmit = (e) => {
        e.preventDefault();

        this.validateAddressInput();
        this.validateAmountInput();

        if (this.errors['amount'] != false || this.errors['address'] != false) {
          return false;
        }

        let amount = Number(document.querySelector('#withdraw-input-amount').value);
        let address = document.querySelector('#withdraw-input-address').value;

        document.querySelector('.withdraw-confirm-amount').innerText = `${amount} ${this.ticker}`;
        document.querySelector('.withdraw-address-1').innerText = address.slice(0, -8);
        document.querySelector('.withdraw-address-2').innerText = address.slice(-8);

        document.querySelector('.withdraw-confirm-fee').innerText =
          `(fee: ${this.fee} ${this.ticker})`;

        // Change view to confirmation screen
        document.querySelector('#withdraw-step-one').classList.toggle('hide-element');
        document.querySelector('#withdraw-step-two').classList.toggle('hide-element');
      };

      document.querySelector('#withdraw-cancel').onclick = (e) => {
        e.preventDefault();
        document.querySelector('#withdraw-step-one').classList.toggle('hide-element');
        document.querySelector('#withdraw-step-two').classList.toggle('hide-element');
      };

      document.querySelector('#withdraw-confirm').onclick = async (e) => {
        e.preventDefault();

        try {
          let amount = document.querySelector('#withdraw-input-amount').value;
          let address = document.querySelector('#withdraw-input-address').value;

          let ticker = this.ticker;
          let sender = this.pc.formatAddress();

          document.querySelector('.withdraw-msg-icon').classList.toggle('fa-circle-exclamation');
          document.querySelector('.confirm-msg-container .spinner').classList.add('show');
          document.querySelector('.withdraw-msg-icon').classList.toggle('hide');

          document.querySelector('.confirm-submit').style.opacity = 0;
          document.querySelector('.withdraw-msg-text').innerText = 'Sending';
          document.querySelector('.withdraw-msg-question').innerText = '...';

          console.log('network fee:', this.fee);

          if (this_withdraw.isNftWithdrawSelection()) {
            const nft = await this_withdraw.loadSaitoNftForWithdraw();
            const amountRaw = String(amount).trim();
            let amountInt;
            try {
              amountInt = parseInt(amountRaw, 10);
            } catch (e) {
              throw new Error('Error sending NFT: invalid amount.');
            }
            if (!Number.isInteger(amountInt) || amountInt <= 0) {
              throw new Error('Error sending NFT: amount must be a positive integer.');
            }
            const tx_msg = JSON.parse(JSON.stringify(nft.txmsg || {}));
            let newtx = await this_withdraw.app.wallet.createNFTTransaction(
              nft,
              address,
              amountInt,
              BigInt(0),
              BigInt(0),
              tx_msg
            );

            //
            // having created the NFT, we now modify its TX_MSG if there are
            // any handlers that want to process the transaction
            //
            newtx = await nft.modifyBeforeSend(newtx, address);
            if (!newtx) {
              throw new Error('NFT transfer blocked by module.');
            }

            await newtx.sign();
            await this_withdraw.app.network.propagateTransaction(newtx);
            try {
              await this_withdraw.app.wallet.updateNFTList();
            } catch (e) {
              console.warn('withdraw NFT: updateNFTList', e);
            }
            this_withdraw.app.connection.emit('saito-header-update-crypto');
            if (document.querySelector('.nft-list-container')) {
              this_withdraw.app.connection.emit('saito-nft-list-render-request');
            }
            this_withdraw.withdrawBroadcastSuccessUi();
            return;
          }

          let ts = new Date().getTime();
          await this.app.wallet.sendPayment(
            ticker,
            [sender],
            [address],
            [amount],
            btoa(sender + address + amount + ts),
            async function (res) {
              if (res.hash != '') {
                this_withdraw.withdrawBroadcastSuccessUi();
              } else {
                this_withdraw.showError();
              }
            },
            this?.publicKey
          );
        } catch (err) {
          console.error('Send Error: ' + err);
          this_withdraw.showError(err?.message || String(err));
        }
      };

      if (document.querySelector('#withdraw-max-btn') != null) {
        document.querySelector('#withdraw-max-btn').onclick = async (e) => {
          if (!document.querySelector('#withdraw-input-amount').disabled) {
            await this_withdraw.refreshAvailableBalanceDisplay();
            if (this_withdraw.isNftWithdrawSelection()) {
              document.querySelector('#withdraw-input-amount').value = String(
                this_withdraw._nft_balance_raw != null
                  ? this_withdraw._nft_balance_raw
                  : this_withdraw.available_balance
              );
            } else {
              const fee = Number(this_withdraw.fee) || 0;
              document.querySelector('#withdraw-input-amount').value = String(
                this_withdraw.available_balance - fee
              );
            }
            this_withdraw.validateAmountInput();
          }
        };
      }

      if (document.getElementById('address-book')) {
        document.getElementById('address-book').onclick = (e) => {
          this.contacts.title = `Contacts with ${this.ticker}`;
          this.contacts.callback = (key) => {
            this.publicKey = key;
            this.render();
          };

          let contactsWithCrypto = this.app.keychain.returnKeys();

          if (this.ticker !== 'SAITO') {
            contactsWithCrypto = contactsWithCrypto.filter(
              (k) => k?.crypto_addresses && k.crypto_addresses[this.ticker]
            );
          }

          contactsWithCrypto = contactsWithCrypto.map((x) => x.publicKey);

          this.contacts.render(contactsWithCrypto);
        };
      }
    }
  }

  showError(detail = '') {
    let msg = `Transfer request unsuccessful <br > Please try again`;
    if (detail) {
      const safe = this.app.browser.escapeHTML(String(detail));
      msg += `<br><span class="withdraw-error-detail">${safe}</span>`;
    }
    document.querySelector('.confirm-msg').innerHTML = msg;
    document.querySelector('.confirm-msg-container .spinner').classList.remove('show');
    document.querySelector('.withdraw-msg-icon').classList.toggle('hide');
    document.querySelector('.withdraw-msg-icon').classList.remove('fa-circle-notch');
    document.querySelector('.withdraw-msg-icon').classList.remove('fa-circle-check');
    document.querySelector('.withdraw-msg-icon').classList.toggle('fa-circle-xmark');
  }

  /** Synthetic NFT row from multiwallet (see {@link NFTCryptoModule}). */
  isNftWithdrawSelection() {
    return this.pc?.categories === 'NFT' && typeof this.pc?.nft_id === 'string' && this.pc.nft_id;
  }

  /** Wallet row + archive mint tx, aligned with nft-overlay send. */
  async loadSaitoNftForWithdraw() {
    const nft_id = this.pc.nft_id;
    const list = this.app?.options?.wallet?.nfts || [];
    const row = list.find((n) => n && n.id === nft_id);
    if (!row) {
      throw new Error('Error loading NFT: no wallet row for this NFT id.');
    }
    const modStub = { publicKey: this.app.wallet.publicKey };
    const nft = new SaitoNFT(this.app, modStub, null, row);
    await nft.fetchTransaction();
    if (nft.load_failed && !nft.tx) {
      throw new Error(
        'Error loading NFT: mint transaction not available (local archive / sync).'
      );
    }
    return nft;
  }

  withdrawBroadcastSuccessUi() {
    setTimeout(function () {
      if (document.querySelector('.confirm-msg')) {
        document.querySelector('.confirm-msg').innerHTML =
          `Your transaction has been broadcast <br > Please check transaction history in the sidebar menu for confirmation`;
        document.querySelector('.confirm-msg-container .spinner').classList.remove('show');
        document.querySelector('.withdraw-msg-icon').classList.toggle('hide');
        document.querySelector('.withdraw-msg-icon').classList.toggle('fa-circle-check');
      }
    }, 1000);
  }

  hideSaitoHeaderMenu() {
    let components = this.mod.components;
    for (let key in components) {
      if (components[key]?.slug == 'SaitoHeader') {
        let saito_header = components[key];
        saito_header.hideMenu();
      }
    }
  }

  async fetchWithdrawFee() {
    let this_withdraw = this;
    let address = document.querySelector('#withdraw-input-address').value;

    document.querySelector('.withdraw-info-value.fee').innerHTML = 'updating...';
    this.pc.checkWithdrawalFeeForAddress(address, (amt) => {
      this.fee = Number(amt);
      document.querySelector('.withdraw-info-value.fee').innerHTML = `${amt} ${this.ticker}`;
    });
  }

  validateAmountInput() {
    this.clearAmountError();

    let amount = document.querySelector('#withdraw-input-amount').value;
    let error_msg = null;

    if (amount != '') {
      if (this.isNftWithdrawSelection()) {
        const amtStr = String(amount).trim();
        try {
          const want = BigInt(amtStr);
          const avail =
            this._nft_balance_raw != null && this._nft_balance_raw !== ''
              ? BigInt(this._nft_balance_raw)
              : BigInt(Math.floor(Number(this.available_balance) || 0));
          if (want <= 0n) {
            error_msg = 'Error: Amount should be greater than 0';
          } else if (want > avail) {
            error_msg = `Error: Insufficient NFT units (${avail.toString()} ${this.ticker} available)`;
          }
        } catch (e) {
          error_msg = 'Error: Enter a whole number of NFT units';
        }
      } else {
        amount = Number(amount);

        let amount_avl = this.available_balance;
        this.fee = Number(this.fee);

        if (amount <= 0) {
          error_msg = 'Error: Amount should be greater than 0';
        } else if (amount > amount_avl) {
          error_msg = `Error: Insufficent funds ( ${amount_avl} ${this.ticker} available)`;
        } else if (amount + this.fee > amount_avl) {
          error_msg = `Error: Your withdrawal amount + transaction fee exceeds available balance. Please reduce the amount to cover withdrawal fee.`;
        }
      }
    } else {
      error_msg = 'Error: No input';
    }

    if (error_msg) {
      this.errors['amount'] = true;
      document.querySelector('#withdraw-amount-error').innerHTML = error_msg;
      document.querySelector('#withdraw-amount-error').style.display = 'block';
    }

    this.handleErrors();
  }

  validateAddressInput() {
    this.clearAddressError();

    let address = document.querySelector('#withdraw-input-address').value;

    let valid = this.pc.validateAddress(address);

    if (!valid) {
      document.querySelector('#withdraw-address-error').innerHTML =
        'Error: Invalid ' + this.ticker + ' address';
      document.querySelector('#withdraw-address-error').style.display = 'block';
      this.errors['address'] = true;
    }

    // Disable submission
    this.handleErrors();
  }

  handleErrors() {
    if (this.errors['amount'] != false || this.errors['address'] != false) {
      document.querySelector('#saito-overlay-submit').classList.add('disabled');
    } else {
      document.querySelector('#saito-overlay-submit').classList.remove('disabled');
    }
  }

  clearAddressError() {
    this.errors['address'] = false;
    document.querySelector('#withdraw-address-error').innerHTML = '';
    document.querySelector('#withdraw-address-error').style.display = 'none';
  }

  clearAmountError() {
    // reset errors
    this.errors['amount'] = false;
    document.querySelector('#withdraw-amount-error').innerHTML = '';
    document.querySelector('#withdraw-amount-error').style.display = 'none';
  }

  resetErrors() {
    this.errors = {
      amount: false,
      address: false
    };
    this.clearAddressError();
    this.clearAmountError();

    this.handleErrors();
  }
}

module.exports = Withdraw;
