/**
 * Game / module crypto transfer confirmation & orchestration UI.
 *
 * Wiring (post split from Send):
 *   - saito-crypto-send-render-request   → handled only by Send (validates + forwards)
 *   - saito-crypto-send-confirm-open-request → show overlay + run `mycallback` once
 *   - saito-crypto-send-confirm          → apply success / failure result
 *
 * Presentation: `web/saito/css-imports/saito-crypto.css` (`.crypto-send-confirm-overlay`).
 */

const ConfirmTemplate = require('./confirm.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');

class Confirm {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);

    this.overlay.clickBackdropToClose = false;

    this.counter_party = new SaitoUser(
      this.app,
      this.mod,
      '#crypto-send-confirm-root .counterparty-details'
    );

    /** @type {ReturnType<Confirm['bindElements']> | null} */
    this.el = null;
    this.timeout = null;
    this.countdownTimer = null;

    this.onCloseClick = this.onCloseClick.bind(this);

    this.app.connection.on('saito-crypto-send-confirm-open-request', (details) => {
      console.log('saito-crypto-send-confirm-open-requests', details);
      this.render(details);
    });

    this.app.connection.on('saito-crypto-send-confirm', (rtnValue) => {
      this.applyResult(rtnValue);
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
   *   detailMessage: HTMLElement | null,
   *   spinner: HTMLElement | null,
   *   countdown: HTMLElement | null,
   *   closeBtn: HTMLButtonElement | null,
   *   ignoreCheckbox: HTMLInputElement | null
   * }}
   */
  bindElements(root) {
    return {
      root,
      title: root.querySelector('#crypto_send_confirm_title'),
      amount: root.querySelector('#crypto_send_confirm_amount'),
      address: root.querySelector('#crypto_send_confirm_address'),
      detailMessage: root.querySelector('#crypto_send_confirm_detail'),
      spinner: root.querySelector('#crypto_send_confirm_spinner'),
      countdown: root.querySelector('#crypto_send_confirm_countdown'),
      closeBtn: root.querySelector('#crypto_send_confirm_close'),
      ignoreCheckbox: root.querySelector('#crypto_send_confirm_ignore')
    };
  }

  refreshDomRefs() {
    const root = document.getElementById('crypto-send-confirm-root');
    this.el = root ? this.bindElements(root) : null;
  }

  /**
   * @param details {{ ticker?: string, amount?: string, publicKey?: string, address?: string, trusted?: boolean, mycallback?: function }}
   * @returns {{ ok: true } | { ok: false, message: string }}
   */
  validateOpen(details) {
    if (!details?.ticker || !details?.amount) {
      return { ok: false, message: 'Missing currency or amount for this transfer.' };
    }
    if (!details?.publicKey || !details?.address) {
      return { ok: false, message: 'Missing recipient or destination address.' };
    }
    return { ok: true };
  }

  onCloseClick() {
    if (this.el?.ignoreCheckbox?.checked) {
      this.mod.saveGamePreference('crypto_transfers_outbound_trusted', 1);
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

  applyRootLayout(details) {
    const root = this.el?.root;
    if (!root) {
      return;
    }

    const trusted = Boolean(details?.trusted);
    root.dataset.confirmMode = trusted ? 'trusted' : 'interactive';

    const showGameIgnore = !trusted && this.mod?.game?.over === 0;
    root.classList.toggle('crypto-send-confirm-overlay--show-ignore', showGameIgnore);
  }

  clearStatusCopy() {
    if (!this.el?.root) {
      return;
    }
    this.el.root.classList.remove('crypto-send-confirm-overlay--has-detail');
    if (this.el.detailMessage) {
      this.el.detailMessage.textContent = '';
    }
  }

  /**
   * @param details {{ ticker: string, amount: string, publicKey: string, address: string, trusted?: boolean, mycallback?: function }}
   */
  render(details) {
    const check = this.validateOpen(details);
    if (!check.ok) {
      console.error('Crypto send confirm overlay:', check.message);
      return;
    }

    this.clearTimers();

    this.overlay.show(ConfirmTemplate());
    this.refreshDomRefs();

    if (!this.el?.root) {
      return;
    }

    this.clearStatusCopy();
    this.applyRootLayout(details);

    if (this.el.title) {
      this.el.title.textContent = 'Sending Payment';
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

    this.el.root.dataset.confirmState = 'pending';

    this.counter_party.publicKey = details.publicKey;
    this.counter_party.render();

    // Include publickey if the SaitoUser is going to be showing a name
    if (this.app.keychain.returnIdentifierByPublicKey(details.publicKey)) {
      this.counter_party.updateUserline(
        details.publicKey.slice(0, 8) + '…' + details.publicKey.slice(-8),
        details.publicKey
      );
    }

    if (details?.mycallback) {
      details.mycallback();
    }

    this.attachEvents();

    if (details?.trusted) {
      this.timeout = setTimeout(() => {
        this.overlay.close();
        this.timeout = null;
      }, 3000);

      this.scheduleCountdownTick();
    }
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
   * @param results {{ hash?: string, err?: unknown }}
   */
  applyResult(results) {
    this.refreshDomRefs();
    const root = this.el?.root;
    if (!root) {
      return;
    }

    const success = Boolean(results?.hash && !results?.err);

    if (this.el.title) {
      this.el.title.textContent = success ? 'Payment sent' : 'Payment failed';
    }

    root.dataset.confirmState = success ? 'success' : 'failed';

    if (success) {
      root.classList.remove('crypto-send-confirm-overlay--has-detail');
      if (this.el.detailMessage) {
        this.el.detailMessage.textContent = '';
      }
    }

    if (!success && this.el.detailMessage) {
      const err = results?.err;
      const msg =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
            ? err.message
            : '';
      this.el.detailMessage.textContent = msg || 'This transfer could not be confirmed.';
      root.classList.add('crypto-send-confirm-overlay--has-detail');
    }

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.overlay.close();
        this.timeout = null;
      }, 3000);
      if (this.el.countdown) {
        this.el.countdown.textContent = '3';
      }
    }
  }
}

module.exports = Confirm;
