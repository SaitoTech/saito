const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const UnlockTemplate = require('./unlock.template');
const { applyPublishOverlayShell } = require('./overlay.shell');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatScriptForDisplay(script) {
  return JSON.stringify(script, null, 2);
}

function parseSaitoAmount(raw, allowZero = false) {
  const text = String(raw || '').trim();
  if (!text && allowZero) {
    return '0';
  }
  if (!text) {
    return null;
  }
  const num = Number(text);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  if (!allowZero && num <= 0) {
    return null;
  }
  return text;
}

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
    this.destinationPublicKey = '';
    this.blockedRoot = null;

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.step) {
        this.hide();
      }
    };
  }

  async openSolution() {
    const ctx = this.mod.unlockContext;
    if (!ctx?.lockedSlip) {
      return;
    }

    const script = this.mod.getScript();
    const lockedNolan =
      ctx?.assetType === 'nft' && ctx?.lockedNftSlips?.[1]
        ? BigInt(ctx.lockedNftSlips[1].amount || 0)
        : BigInt(ctx?.lockedSlip?.amount || 0);
    const defaultFee = this.app.wallet.convertNolanToSaito(
      this.app.wallet.default_fee || BigInt(0)
    );
    const fee = defaultFee && defaultFee !== '0.00' ? defaultFee : '0.001';
    const feeNolan = this.app.wallet.convertSaitoToNolan(fee);
    const outputNolan = lockedNolan > feeNolan ? lockedNolan - feeNolan : BigInt(0);
    const amount = this.app.wallet.convertNolanToSaito(outputNolan);

    const destinationPublicKey =
      (await this.app.wallet.getPublicKey()) || ctx.destinationPublicKey || '';

    this.destinationPublicKey = destinationPublicKey;
    this.step = 'solution';

    this.show(
      UnlockTemplate.solutionOverlay({
        scriptDisplay: escapeHtml(formatScriptForDisplay(script)),
        destinationPublicKey: escapeHtml(destinationPublicKey),
        amount,
        fee
      })
    );
    this.bindSolutionEvents();
  }

  /**
   * Hand off unlock confirmation UX to the shared Saito Transaction Monitor.
   */
  watchTransaction(tx) {
    if (!this.mod.transaction_monitor) {
      console.error('RustScript: transaction_monitor is not initialized');
      return;
    }

    this.mod.transaction_monitor.render({
      tx,
      title: 'Unlocking Script',
      lead: 'Your unlock transaction is being broadcast to the Saito network.',
      subtitle: 'Waiting for confirmation...',
      successTitle: 'Script Unlocked',
      successLead:
        'Your unlock transaction has been confirmed and the locked funds have been released.',
      successActionLabel: 'Continue',
      callback: (result) => {
        if (result?.status === 'confirmed') {
          this.mod.resetUnlockWorkflow();
          this.mainUi?.welcomeOverlay?.render('splash');
        }
      }
    });
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
      errorEl.textContent = msg;
      errorEl.hidden = !msg;
    };

    root.querySelector('[data-action="unlock-broadcast"]')?.addEventListener('click', async () => {
      showError('');
      const destination = root.querySelector('.rs-unlock-destination')?.value?.trim();
      const feeRaw = root.querySelector('.rs-unlock-fee')?.value;
      const fee = parseSaitoAmount(feeRaw, true);

      if (!destination || !this.app.crypto.isPublicKey(destination)) {
        showError('Enter a valid destination public key.');
        return;
      }
      if (fee === null) {
        showError('Enter a valid fee.');
        return;
      }

      const btn = root.querySelector('[data-action="unlock-broadcast"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Broadcasting…';
      }

      try {
        this.destinationPublicKey = destination;
        const tx = await this.mod.broadcastSolution({
          destinationPublicKey: destination,
          feeSaito: fee || '0'
        });
        this.hide();
        this.watchTransaction(tx);
      } catch (err) {
        showError(err?.message || 'Could not broadcast the unlock transaction.');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'BROADCAST SOLUTION';
        }
      }
    });
  }
}

module.exports = UnlockFlow;
