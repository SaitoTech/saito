const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const UnlockFeeTemplate = require('./unlock-fee.template');
const { applyPublishOverlayShell } = require('./overlay.shell');
const {
  lockUnlockFeeAmount,
  hasUnlockFee,
  isUnlockEditable,
  UNLOCK_SIGNED_ERROR,
  UNLOCK_FEE_LOCKED_ERROR
} = require('../unlock_tx_fee');
const { parsePositiveSaitoAmount } = require('../unlock_tx_edit');

class UnlockFeeFlow {
  constructor(app, mod, mainUi) {
    this.app = app;
    this.mod = mod;
    this.mainUi = mainUi;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay rs-publish-overlay-shell';
    this.overlay.clickBackdropToClose = true;
    this.overlay.nonBlocking = false;

    this.step = null;
    this.blockedRoot = null;

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.step) {
        this.hide();
      }
    };
  }

  async open() {
    if (!isUnlockEditable(this.mod)) {
      window.alert(UNLOCK_SIGNED_ERROR);
      return;
    }
    if (hasUnlockFee(this.mod)) {
      window.alert(UNLOCK_FEE_LOCKED_ERROR);
      return;
    }

    const raw = this.app.wallet.convertNolanToSaito(this.app.wallet.default_fee || BigInt(0));
    const defaultFee = raw && raw !== '0.00' ? raw : '0.001';

    this.step = 'fee';
    this.show(UnlockFeeTemplate.feeOverlay({ defaultFee }));
    this.bindEvents();
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
  }

  bindEvents() {
    const root = document.querySelector('.rs-unlock-fee-overlay');
    if (!root) {
      return;
    }

    const errorEl = root.querySelector('.rs-unlock-fee-error');
    const input = root.querySelector('.rs-unlock-fee-amount');
    const showError = (msg) => {
      if (!errorEl) {
        return;
      }
      errorEl.textContent = msg || '';
      errorEl.hidden = !msg;
    };

    root.querySelector('[data-action="set-unlock-fee"]')?.addEventListener('click', async () => {
      showError('');
      const fee = parsePositiveSaitoAmount(input?.value);
      if (fee === null) {
        showError('Enter a valid fee greater than zero.');
        return;
      }

      const btn = root.querySelector('[data-action="set-unlock-fee"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Setting Fee…';
      }

      try {
        await lockUnlockFeeAmount(this.app, this.mod, fee);
        this.hide();
        if (this.mainUi) {
          this.mainUi.syncEditorModes?.();
          await this.mainUi.refresh?.({ skipTestSync: true });
        } else {
          this.mainUi?.panel?.render?.();
        }
      } catch (err) {
        showError(err?.message || 'Could not set transaction fee.');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Set Transaction Fee';
        }
      }
    });

    input?.focus({ preventScroll: true });
    input?.select?.();
  }
}

module.exports = UnlockFeeFlow;
