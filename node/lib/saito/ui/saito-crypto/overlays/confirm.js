/**
 * Game / module crypto transfer confirmation & orchestration UI.
 *
 * Wiring (post split from Send):
 *   - saito-crypto-send-render-request   → handled only by Send (validates + forwards)
 *   - saito-crypto-send-confirm-open-request → show overlay + run `mycallback` once
 *   - saito-crypto-send-confirm          → apply success / failure result
 *
 * Presentation: `mods/crypto/web/css/crypto-overlays.css` (`.crypto-send-confirm-overlay`).
 */

const ConfirmTemplate = require('./confirm.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');

class Confirm {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);

    this.counter_party = new SaitoUser(
      this.app,
      this.mod,
      '#crypto-send-confirm-root .counterparty-details'
    );

    this.el = null;
    this.timeout = null;
    this.countdownTimer = null;

    this.app.connection.on('saito-crypto-send-confirm-open-request', (details) => {
      console.log('saito-crypto-send-confirm-open-requests', details);
      this.render(details);
    });

    this.app.connection.on('saito-crypto-send-confirm', (rtnValue, callback_on_close) => {
      this.applyResult(rtnValue);
      this.callback = callback_on_close;
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
   *   detailMessage: HTMLElement | null,
   *   countdown: HTMLElement | null,
   * }}
   */
  bindElements() {
    const root = document.getElementById('crypto-send-confirm-root');
    if (root) {
      return {
        root,
        title: root.querySelector('#crypto_send_confirm_title'),
        detailMessage: root.querySelector('#crypto_send_confirm_detail'),
        countdown: root.querySelector('#crypto_send_confirm_countdown')
      };
    }
    return null;
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

    this.overlay.show(ConfirmTemplate(details), () => {
      // We can pass a callback to be run after the overlay is closed...
      if (this.callback) {
        this.callback();
      }
      this.el = null;
      this.callback = null;
      this.clearTimers();
    });
    this.overlay.blockClose('#crypto_send_confirm_close');

    this.el = this.bindElements();

    if (!this.el?.root) {
      console.error('bindElement failure...');
      this.overlay.close();
      return;
    }

    this.counter_party.publicKey = details.publicKey;
    this.counter_party.render();
    this.counter_party.updateUserline(details.publicKey, details.publicKey);

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

  attachEvents() {
    let cls_btn = document.querySelector('#crypto-send-confirm-root #crypto_send_confirm_close');
    if (cls_btn) {
      cls_btn.onclick = () => {
        this.overlay.close();
      };
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
    const el = this.bindElements();
    if (!el) {
      return;
    }

    console.log(results);

    const success = Boolean(results?.hash && !results?.err);

    if (el.title) {
      el.title.textContent = success ? 'Payment sent' : 'Payment failed';
    }

    el.root.dataset.confirmState = success ? 'success' : 'failed';

    if (success) {
      el.root.classList.remove('crypto-send-confirm-overlay--has-detail');
      if (el.detailMessage) {
        el.detailMessage.textContent = '';
      }
    }

    if (!success && el.detailMessage) {
      const err = results?.err;
      const msg =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
            ? err.message
            : '';
      el.detailMessage.textContent = msg || 'This transfer could not be confirmed.';
      el.root.classList.add('crypto-send-confirm-overlay--has-detail');
    }

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.overlay.close();
        this.timeout = null;
      }, 3000);
      if (el.countdown) {
        el.countdown.textContent = '3';
      }
    }
  }
}

module.exports = Confirm;
