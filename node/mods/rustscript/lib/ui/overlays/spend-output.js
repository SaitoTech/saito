const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SpendOutputTemplate = require('./spend-output.template');
const { applyPublishOverlayShell } = require('./overlay.shell');
const {
  addSaitoOutput,
  addNftOutput,
  formatNolanAmount,
  parsePositiveSaitoAmount,
  remainingSaitoNolan
} = require('../unlock_tx_edit');

/**
 * Create an output on unlock_transaction_base from a selected input.
 */
class SpendOutputFlow {
  constructor(app, mod, mainUi) {
    this.app = app;
    this.mod = mod;
    this.mainUi = mainUi;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay rs-publish-overlay-shell';
    this.overlay.clickBackdropToClose = true;
    this.overlay.nonBlocking = false;

    this.step = null;
    this.kind = null;
    this.inputIndex = 0;
    this.availableNolan = BigInt(0);
    this.availableDisplay = '';
    this.blockedRoot = null;

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.step) {
        this.hide();
      }
    };
  }

  openForInput({ kind = 'saito', inputIndex = 0 } = {}) {
    const { isUnlockEditable, UNLOCK_SIGNED_ERROR } = require('../unlock_tx_fee');
    if (!isUnlockEditable(this.mod)) {
      window.alert(UNLOCK_SIGNED_ERROR);
      return;
    }

    this.kind = kind === 'nft' ? 'nft' : 'saito';
    this.inputIndex = Number(inputIndex) || 0;
    this.step = this.kind;

    if (this.kind === 'nft') {
      this.availableNolan = BigInt(0);
      this.availableDisplay = '';
      this.show(SpendOutputTemplate.transferNftOverlay());
      this.bindNftEvents();
      return;
    }

    this.availableNolan = remainingSaitoNolan(this.mod);
    this.availableDisplay = `${formatNolanAmount(this.app, this.availableNolan)} SAITO`;
    this.show(SpendOutputTemplate.spendSaitoOverlay({ availableDisplay: this.availableDisplay }));
    this.bindSaitoEvents();
  }

  show(html) {
    document.body.classList.add('rs-publish-modal-open');
    this.blockedRoot = document.querySelector('main.rustscript');
    if (this.blockedRoot) {
      this.blockedRoot.inert = true;
    }
    document.addEventListener('keydown', this.onEscapeKey);
    this.overlay.show(html, () => {
      this.onOverlayClosed();
    });
    applyPublishOverlayShell(this.overlay);
  }

  hide() {
    if (this.step) {
      this.overlay.close();
    }
  }

  onOverlayClosed() {
    document.body.classList.remove('rs-publish-modal-open');
    document.removeEventListener('keydown', this.onEscapeKey);
    if (this.blockedRoot) {
      this.blockedRoot.inert = false;
      this.blockedRoot = null;
    }
    this.step = null;
    this.kind = null;
    this.availableNolan = BigInt(0);
    this.availableDisplay = '';
    this.mainUi?.clearUnlockInputSelection?.();
  }

  async fillMyPublicKey(inputEl, showError) {
    try {
      let pk = '';
      if (typeof this.app.wallet?.getPublicKey === 'function') {
        pk = await this.app.wallet.getPublicKey();
      } else if (typeof this.app.wallet?.returnPublicKey === 'function') {
        pk = this.app.wallet.returnPublicKey();
      }
      if (!pk) {
        showError('Could not read your public key.');
        return;
      }
      inputEl.value = String(pk);
      showError('');
      inputEl.focus({ preventScroll: true });
    } catch (_err) {
      showError('Could not read your public key.');
    }
  }

  validateSaitoAmount(amountRaw, showError) {
    const amount = parsePositiveSaitoAmount(amountRaw);
    if (amount === null) {
      showError('Enter a valid amount.');
      return null;
    }

    let amountNolan;
    try {
      amountNolan = this.app.wallet.convertSaitoToNolan(amount);
    } catch (_err) {
      showError('Enter a valid amount.');
      return null;
    }

    if (amountNolan <= BigInt(0)) {
      showError('Enter an amount greater than zero.');
      return null;
    }

    if (amountNolan > this.availableNolan) {
      showError(`Only ${this.availableDisplay} available.`);
      return null;
    }

    showError('');
    return amount;
  }

  bindSaitoEvents() {
    const root = document.querySelector('.rs-spend-saito');
    if (!root) {
      return;
    }

    const errorEl = root.querySelector('.rs-spend-error');
    const recipientInput = root.querySelector('.rs-spend-recipient');
    const amountInput = root.querySelector('.rs-spend-amount');

    const showError = (msg) => {
      if (!errorEl) {
        return;
      }
      errorEl.textContent = msg || '';
      errorEl.hidden = !msg;
    };

    root.querySelector('.rs-spend-use-mine')?.addEventListener('click', () => {
      if (recipientInput) {
        this.fillMyPublicKey(recipientInput, showError);
      }
    });

    root.querySelector('[data-action="spend-max"]')?.addEventListener('click', () => {
      if (!amountInput) {
        return;
      }
      amountInput.value = formatNolanAmount(this.app, this.availableNolan);
      this.validateSaitoAmount(amountInput.value, showError);
      amountInput.focus({ preventScroll: true });
    });

    amountInput?.addEventListener('input', () => {
      const raw = String(amountInput.value || '').trim();
      if (!raw) {
        showError('');
        return;
      }
      this.validateSaitoAmount(raw, showError);
    });

    root.querySelector('[data-action="create-output"]')?.addEventListener('click', () => {
      showError('');
      const recipient = recipientInput?.value?.trim() || '';
      const amount = this.validateSaitoAmount(amountInput?.value, showError);

      if (!recipient || !this.app.crypto.isPublicKey(recipient)) {
        showError('Enter a valid recipient address.');
        return;
      }
      if (amount === null) {
        return;
      }

      try {
        // Prefer exact nolan when the field matches MAX / full remaining display.
        // SAITO string round-trips can leave 1-nolan dust and hide the broadcast button.
        const typed = String(amountInput?.value || '').trim();
        const maxDisplay = formatNolanAmount(this.app, this.availableNolan);
        const useExact =
          typed === maxDisplay ||
          this.app.wallet.convertSaitoToNolan(amount) >= this.availableNolan;

        addSaitoOutput(
          this.app,
          this.mod,
          useExact
            ? { recipient, amountNolan: this.availableNolan }
            : { recipient, amountSaito: amount },
          this.mainUi
        );
        this.hide();
        this.mainUi?.refresh?.({ skipTestSync: true });
      } catch (err) {
        showError(err?.message || 'Could not create output.');
      }
    });

    recipientInput?.focus({ preventScroll: true });
  }

  bindNftEvents() {
    const root = document.querySelector('.rs-spend-nft');
    if (!root) {
      return;
    }

    const errorEl = root.querySelector('.rs-spend-error');
    const recipientInput = root.querySelector('.rs-spend-recipient');

    const showError = (msg) => {
      if (!errorEl) {
        return;
      }
      errorEl.textContent = msg || '';
      errorEl.hidden = !msg;
    };

    root.querySelector('.rs-spend-use-mine')?.addEventListener('click', () => {
      if (recipientInput) {
        this.fillMyPublicKey(recipientInput, showError);
      }
    });

    root.querySelector('[data-action="transfer-nft"]')?.addEventListener('click', () => {
      showError('');
      const recipient = recipientInput?.value?.trim() || '';
      if (!recipient || !this.app.crypto.isPublicKey(recipient)) {
        showError('Enter a valid recipient address.');
        return;
      }

      try {
        addNftOutput(this.app, this.mod, { recipient }, this.mainUi);
        this.hide();
        this.mainUi?.refresh?.({ skipTestSync: true });
      } catch (err) {
        showError(err?.message || 'Could not transfer NFT.');
      }
    });

    recipientInput?.focus({ preventScroll: true });
  }
}

module.exports = SpendOutputFlow;
