const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const UnlockTemplate = require('./unlock.template');
const { applyPublishOverlayShell } = require('./overlay.shell');
const { hasUnlockFee } = require('../unlock_tx_fee');
const { unlockUserOutputs } = require('../unlock_tx_edit');

class UnlockFlow {
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

  async openSolution() {
    const ctx = this.mod.unlockContext;
    if (!ctx?.lockedSlip && !(Array.isArray(ctx?.lockedNftSlips) && ctx.lockedNftSlips.length)) {
      return;
    }
    if (!this.mod.unlock_transaction_base) {
      return;
    }
    if (!hasUnlockFee(this.mod)) {
      return;
    }

    const feeSaito = String(this.mod.unlock_fee.feeSaito || '');
    const feeDisplay = feeSaito ? `${feeSaito} SAITO` : '—';
    const outputs = unlockUserOutputs(this.mod);
    const outputSummary =
      outputs.length === 1
        ? '1 destination'
        : `${outputs.length} destinations`;

    this.step = 'solution';
    this.show(
      UnlockTemplate.solutionOverlay({
        feeDisplay,
        outputSummary
      })
    );
    this.bindSolutionEvents();
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
    this.applyOverlayLayout();
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

  applyOverlayLayout() {
    applyPublishOverlayShell(this.overlay);
  }

  bindSolutionEvents() {
    const root = document.querySelector('.rs-unlock-solution');
    if (!root) {
      return;
    }

    const errorEl = root.querySelector('.rs-unlock-error');
    const showError = (msg) => {
      if (!errorEl) {
        return;
      }
      errorEl.textContent = msg || '';
      errorEl.hidden = !msg;
    };

    root.querySelector('[data-action="unlock-broadcast"]')?.addEventListener('click', async () => {
      showError('');

      const btn = root.querySelector('[data-action="unlock-broadcast"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Broadcasting…';
      }

      try {
        await this.mod.broadcastSolution({
          callback: (result) => {
            if (result?.status === 'confirmed') {
              this.mod.resetUnlockWorkflow();
              this.mainUi?.welcomeOverlay?.render('splash');
            }
          }
        });
        this.hide();
      } catch (err) {
        showError(err?.message || 'Could not broadcast the unlock transaction.');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Broadcast Unlock Transaction';
        }
      }
    });
  }
}

module.exports = UnlockFlow;
