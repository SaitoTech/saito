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

    this.expected_hash = null;

    /************
      Details: 
      ***********
      publicKey,
      address,
      amount,
      ticker,
      hash, 
      mycallback, 
    */
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
  bindElements() {
    const root = document.getElementById('receive-crypto-request-root');
    if (root) {
      return {
        root,
        title: root.querySelector('#crypto_receive_title'),
        amount: root.querySelector('#crypto_receive_amount'),
        address: root.querySelector('#crypto_receive_address'),
        countdown: root.querySelector('#crypto_receive_countdown'),
        closeBtn: root.querySelector('#crypto_receive_close'),
        ignoreCheckbox: root.querySelector('#crypto_receive_ignore')
      };
    } else {
      return null;
    }
  }

  attachEvents() {
    if (this.el?.closeBtn) {
      this.el.closeBtn.addEventListener('click', () => {
        this.overlay.close();
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

    this.overlay.show(ReceiveTemplate(details), () => {
      this.expected_hash = null;

      // Register callback here if it exists
      // triggered by closing the overlay
      if (details.mycallback) {
        details.mycallback();
      }
    });
    this.overlay.blockClose();

    // collect all the DOM references to parts of the overlay
    this.el = this.bindElements();
    if (!this.el?.root) {
      console.error('Error rendering receive overlay');
      return;
    }

    this.counter_party.publicKey = details.publicKey;
    this.counter_party.render();

    if (this.app.keychain.returnIdentifierByPublicKey(details.publicKey)) {
      this.counter_party.updateUserlineAddress(details.publicKey);
    }

    this.attachEvents();
  }

  onReceivePayment() {
    this.expected_hash = null;

    // This is a catch in case the user closed the overlay already
    const root = this.bindElements();
    if (!root) {
      return;
    }

    if (root?.title) {
      root.title.textContent = 'Payment received';
    }

    root.root.dataset.receiveState = 'success';
  }
}

module.exports = Receive;
