/**
 * In-game crypto receive overlay — waiting for / confirming inbound payment.
 *
 * Presentation: `web/saito/css-imports/saito-crypto.css` (`.crypto-receive-overlay`).
 */

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
      '#receive-crypto-request-root .counterparty-details'
    );

    /** @type {ReturnType<Receive['bindElements']> | null} */
    this.el = null;
    this.timeout = null;
    this.countdownTimer = null;

    this.onCloseClick = this.onCloseClick.bind(this);

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

  clearTimers() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /**
   * @returns {null | {
   *   root: HTMLElement,
   *   title: HTMLElement | null,
   *   amount: HTMLElement | null,
   *   address: HTMLElement | null,
   *   countdown: HTMLElement | null,
   *   closeBtn: HTMLButtonElement | null,
   *   ignoreCheckbox: HTMLInputElement | null
   * }}
   */
  bindElements(root) {
    return {
      root,
      title: root.querySelector('#crypto_receive_title'),
      amount: root.querySelector('#crypto_receive_amount'),
      address: root.querySelector('#crypto_receive_address'),
      countdown: root.querySelector('#crypto_receive_countdown'),
      closeBtn: root.querySelector('#crypto_receive_close'),
      ignoreCheckbox: root.querySelector('#crypto_receive_ignore')
    };
  }

  refreshDomRefs() {
    const root = document.getElementById('receive-crypto-request-root');
    this.el = root ? this.bindElements(root) : null;
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

  applyRootLayout(details) {
    const root = this.el?.root;
    if (!root) {
      return;
    }

    const trusted = Boolean(details?.trusted);
    root.dataset.receiveMode = trusted ? 'trusted' : 'interactive';

    const showGameIgnore = !trusted && this.mod?.game?.over === 0;
    root.classList.toggle('crypto-receive-overlay--show-ignore', showGameIgnore);
  }

  onCloseClick() {
    if (this.el?.ignoreCheckbox?.checked) {
      this.mod.saveGamePreference('crypto_transfers_inbound_trusted', 1);
    }
    this.overlay.close();
  }

  attachEvents() {
    const btn = this.el?.closeBtn;
    if (!btn) {
      return;
    }
    btn.addEventListener('click', this.onCloseClick);
  }

  startAutoCloseCountdown() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.timeout = setTimeout(() => {
      this.overlay.close();
      this.timeout = null;
    }, 3000);
    if (this.el?.countdown) {
      this.el.countdown.textContent = '3';
    }
    this.scheduleCountdownTick();
  }

  scheduleCountdownTick() {
    this.countdownTimer = setTimeout(() => {
      this.countdownTimer = null;
      const span = this.el?.countdown;
      if (!span || !document.body.contains(span)) {
        return;
      }
      let value = parseInt(span.textContent, 10);
      if (Number.isNaN(value)) {
        value = 0;
      }
      value = Math.max(value - 1, 0);
      span.textContent = String(value);
      if (value > 0) {
        this.scheduleCountdownTick();
      }
    }, 900);
  }

  /**
   * Shows a confirmation overlay while waiting for an inbound crypto transfer.
   * @param details {{ ticker: string, amount: string, publicKey: string, address: string, trusted?: boolean, mycallback?: function }}
   */
  render(details) {
    if (!details?.ticker || !details?.amount) {
      console.error('Missing ticker/amount in Receive Crypto Overlay');
      return;
    }

    if (!details?.publicKey || !details?.address) {
      console.error('Missing address in Receive Crypto Overlay');
      return;
    }

    this.clearTimers();

    this.overlay.show(ReceiveTemplate(), () => {
      if (details.mycallback) {
        details.mycallback();
      }
    });

    this.refreshDomRefs();

    if (!this.el?.root) {
      return;
    }

    this.applyRootLayout(details);

    if (this.el.title) {
      this.el.title.textContent = 'Receiving Payment';
    }

    if (this.el.amount) {
      this.el.amount.textContent = `${details.amount} ${details.ticker}`;
    }

    if (this.el.address && details.address && details.address !== details.publicKey) {
      let a = details.address;
      if (a.includes('|')) {
        a = a.split('|')[0];
      }
      if (a.length > 16) {
        this.el.address.textContent = `${a.slice(0, 8)}…${a.slice(-8)}`;
      } else {
        this.el.address.textContent = a;
      }
    }

    this.el.root.dataset.receiveState = 'pending';

    this.counter_party.publicKey = details.publicKey;
    this.counter_party.render();

    if (this.app.keychain.returnIdentifierByPublicKey(details.publicKey)) {
      this.counter_party.updateUserline(
        details.publicKey.slice(0, 8) + '…' + details.publicKey.slice(-8),
        details.publicKey
      );
    }

    this.attachEvents();

    if (details?.trusted) {
      this.startAutoCloseCountdown();
    }
  }

  onReceivePayment() {
    this.refreshDomRefs();
    const root = this.el?.root;
    if (!root) {
      return;
    }

    if (this.el?.title) {
      this.el.title.textContent = 'Payment received';
    }

    root.dataset.receiveState = 'success';

    if (this.timeout) {
      this.startAutoCloseCountdown();
    }
  }
}

module.exports = Receive;
