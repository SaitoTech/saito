/**
 * In-game crypto receive overlay — waiting for / confirming inbound payment.
 *
 * Presentation: `web/saito/css-imports/saito-crypto.css` (`.crypto-receive-overlay`).
 */

const ReceiveTemplate = require('./receive.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');

function findGameById(app, game_id) {
  if (!game_id || !app?.options?.games?.length) {
    return null;
  }
  for (let i = 0; i < app.options.games.length; i++) {
    if (app.options.games[i].id === game_id) {
      return app.options.games[i];
    }
  }
  return null;
}

function resolveGameContext(app, mod, game_id = null) {
  const fromId = findGameById(app, game_id);
  if (fromId) {
    return fromId;
  }
  return mod?.game || null;
}

function resolveGameMod(app, mod, game_id = null) {
  const game = resolveGameContext(app, mod, game_id);
  if (game?.module) {
    return app.modules.returnModuleByName(game.module) || mod;
  }
  return mod;
}

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
    this.expectHash = null;
    this.expectAmount = null;
    this.payer = null;
    this.gameId = null;
    this.earlyPayments = [];

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

  earlyPaymentKey(obj = {}) {
    return `${obj.sender || obj.sender_publickey || ''}|${obj.amount ?? ''}|${obj.ticker || ''}`;
  }

  bufferEarlyPayment(obj = {}) {
    const token = String(obj.sender || obj.sender_publickey || '');
    if (!token) {
      return;
    }
    const key = this.earlyPaymentKey(obj);
    if (!this.earlyPayments.some((o) => this.earlyPaymentKey(o) === key)) {
      this.earlyPayments.push({ ...obj });
      if (this.earlyPayments.length > 8) {
        this.earlyPayments.shift();
      }
    }
  }

  replayEarlyPayments() {
    if (!this.earlyPayments.length) {
      return;
    }
    const pending = this.earlyPayments.splice(0);
    for (const obj of pending) {
      if (this.processExpectedPayment(obj)) {
        return;
      }
    }
    this.earlyPayments.push(...pending);
  }

  processExpectedPayment(obj = {}) {
    const g = resolveGameContext(this.app, this.mod, this.gameId);
    if (!g) {
      return false;
    }
    const ticker = g.crypto;
    const token = String(obj.sender || obj.sender_publickey || '');
    if (!token) {
      return false;
    }
    if (obj.ticker && ticker && obj.ticker !== ticker) {
      return false;
    }

    let from = null;
    for (let i = 0; i < g.players.length; i++) {
      const stored = [g.keys?.[i], g.cryptos?.[i + 1]?.[ticker]?.address].filter(Boolean);
      if (g.players[i] === token || stored.some((s) => s.includes(token))) {
        from = g.players[i];
        break;
      }
    }
    if (!from || (this.payer && from !== this.payer)) {
      return false;
    }

    const amountSource = this.expectAmount ?? obj.amount ?? obj.nft_amount ?? 0;
    let amt = this.app.crypto.convertFloatToSmartPrecision(parseFloat(amountSource));
    if (!amt && amt !== 0) {
      return false;
    }

    let amtH;
    if (ticker === 'SAITO') {
      if (this.expectAmount != null) {
        amtH = this.app.wallet
          .convertSaitoToNolan(
            this.app.crypto.convertFloatToSmartPrecision(parseFloat(this.expectAmount))
          )
          .toString();
      } else {
        const raw = parseFloat(amountSource);
        // WASM payment events report SAITO amounts in nolan; game queue uses SAITO floats.
        if (Number.isFinite(raw) && raw >= this.app.wallet.nolan_per_saito) {
          amtH = String(Math.round(raw));
        } else {
          amtH = this.app.wallet.convertSaitoToNolan(amt).toString();
        }
      }
    } else {
      amtH = String(amt);
    }

    // Prefer the hash from the game engine (payWinner / queue); persisted game dice
    // may be stale after the player has left the game page.
    let hash = this.expectHash;
    if (!hash) {
      hash = this.app.crypto.hash(
        Buffer.from(from + this.mod.publicKey + amtH + g.dice + ticker, 'utf-8')
      );
    }

    const inbound = this.app.options?.crypto?.[ticker]?.transfers_inbound;
    if (!inbound?.length) {
      this.bufferEarlyPayment(obj);
      return false;
    }

    let i = inbound.indexOf(hash);
    if (i < 0) {
      this.bufferEarlyPayment(obj);
      return false;
    }

    inbound.splice(i, 1);
    this.app.wallet.returnCryptoModuleByTicker(ticker)?.save?.();
    this.onReceivePayment(obj);
    return true;
  }

  applyRootLayout(details) {
    const root = this.el?.root;
    if (!root) {
      return;
    }

    const trusted = Boolean(details?.trusted);
    root.dataset.receiveMode = trusted ? 'trusted' : 'interactive';

    const game = resolveGameContext(this.app, this.mod, this.gameId);
    const showGameIgnore = !trusted && game?.over === 0;
    root.classList.toggle('crypto-receive-overlay--show-ignore', showGameIgnore);
  }

  clearExpectedPayment() {
    this.expectHash = null;
    this.expectAmount = null;
    this.payer = null;
    this.gameId = null;
    this.earlyPayments = [];
  }

  onCloseClick() {
    if (this.el?.ignoreCheckbox?.checked) {
      resolveGameMod(this.app, this.mod, this.gameId).saveGamePreference(
        'crypto_transfers_inbound_trusted',
        1
      );
    }
    this.clearExpectedPayment();
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
    this.expectHash = details.hash || null;
    this.expectAmount = details.amount ?? null;
    this.payer = details.publicKey || null;
    this.gameId = details.game_id || null;

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

    if (this.el.address) {
      const showChainAddress = details.address && details.address !== details.publicKey;
      this.el.address.classList.toggle('hide-element', !showChainAddress);
      if (showChainAddress) {
        let a = details.address;
        if (a.includes('|')) {
          a = a.split('|')[0];
        }
        if (a.length > 16) {
          this.el.address.textContent = `${a.slice(0, 8)}…${a.slice(-8)}`;
        } else {
          this.el.address.textContent = a;
        }
      } else {
        this.el.address.textContent = '';
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

    // Retry real payment events that arrived before receivePayment registered the hash.
    this.replayEarlyPayments();
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

    this.clearExpectedPayment();
  }
}

module.exports = Receive;
