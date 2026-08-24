/**
 * In-game crypto receive overlay — waiting for / confirming inbound payment.
 *
 * Presentation: `mods/crypto/web/css/crypto-overlays.css` (`.crypto-receive-overlay`).
 *
 * Preference: crypto_transfers_inbound_trusted (UI/storage; auto-skip behavior later).
 *
 * Queue resume is one-shot via completeReceiveOnce():
 *   - Continue click → completeReceiveOnce()
 *   - Payment arrived → success UI, then completeReceiveOnce()
 * Overlay close must not re-fire the game callback.
 */

const ReceiveTemplate = require('./receive.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class Receive {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);

    this.overlay.clickBackdropToClose = false;

    /** @type {ReturnType<Receive['bindElements']> | null} */
    this.el = null;

    this.expected_hash = null;
    this.mycallback = null;
    this.receive_completed = false;

    this.app.connection.on('saito-crypto-receive-render-request', (details) => {
      this.render(details);
    });

    this.app.connection.on('on-receive-expected-payment', (hash, details) => {
      if (hash == this.expected_hash) {
        this.onReceivePayment();
      }
    });
  }

  /**
   * First-time / absent preference → checked (opt-in invitation).
   * After the user has saved a value → reflect that stored preference.
   */
  readInboundCheckboxDefault() {
    const pref = this.app.options?.gameprefs?.crypto_transfers_inbound_trusted;
    if (pref === undefined || pref === null) {
      return true;
    }
    return !!pref;
  }

  /**
   * @returns {null | {
   *   root: HTMLElement,
   *   title: HTMLElement | null,
   *   amount: HTMLElement | null,
   *   countdown: HTMLElement | null,
   *   closeBtn: HTMLButtonElement | null,
   *   ignoreCheckbox: HTMLInputElement | null
   * }}
   */
  bindElements() {
    const root = document.getElementById('receive-crypto-request-root');
    if (root) {
      return {
        root,
        title: root.querySelector('#crypto_receive_title'),
        amount: root.querySelector('#crypto_receive_amount'),
        countdown: root.querySelector('#crypto_receive_countdown'),
        closeBtn: root.querySelector('#crypto_receive_continue'),
        ignoreCheckbox: root.querySelector('#crypto_receive_auto_accept')
      };
    } else {
      return null;
    }
  }

  saveInboundPreferenceFromCheckbox() {
    const checkbox = document.getElementById('crypto_receive_auto_accept');
    this.app.options.gameprefs = this.app.options.gameprefs || {};
    this.app.options.gameprefs.crypto_transfers_inbound_trusted = checkbox?.checked ? 1 : 0;
    this.app.storage.saveOptions();
  }

  /**
   * One-shot: resume the game queue and close the overlay.
   * Safe to call from Continue or from payment-arrived auto-continue.
   */
  completeReceiveOnce() {
    if (this.receive_completed) {
      return;
    }
    this.receive_completed = true;
    this.expected_hash = null;

    this.saveInboundPreferenceFromCheckbox();

    const cb = this.mycallback;
    this.mycallback = null;
    if (typeof cb === 'function') {
      cb();
    }

    this.overlay.close();
  }

  attachEvents() {
    if (this.el?.closeBtn) {
      this.el.closeBtn.addEventListener('click', () => {
        this.completeReceiveOnce();
      });
    }
  }

  /**
   * Shows a confirmation overlay while waiting for an inbound crypto transfer.
   * @param details {{ ticker: string, amount: string, publicKey: string, address: string, mycallback?: function }}
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

    this.expected_hash = details.hash;
    this.mycallback = typeof details.mycallback === 'function' ? details.mycallback : null;
    this.receive_completed = false;

    const publicKey = details.publicKey;
    details.trustedInbound = this.readInboundCheckboxDefault();
    details.partyName = escapeHtml(this.app.keychain.returnUsername(publicKey));
    details.partyKey = escapeHtml(publicKey);

    this.overlay.show(ReceiveTemplate(details), () => {
      this.expected_hash = null;
      // Queue resume is owned by completeReceiveOnce(); close must not re-fire it.
      this.mycallback = null;
    });
    this.overlay.blockClose();

    this.el = this.bindElements();
    if (!this.el?.root) {
      console.error('Error rendering receive overlay');
      return;
    }

    this.attachEvents();
  }

  onReceivePayment() {
    this.expected_hash = null;

    const root = this.bindElements();
    if (root?.title) {
      root.title.textContent = 'Payment Received';
    }
    if (root?.root) {
      root.root.dataset.receiveState = 'success';
    }

    // Auto-Continue: same one-shot path as the Continue button.
    this.completeReceiveOnce();
  }
}

module.exports = Receive;
