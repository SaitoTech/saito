const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const UnlockTemplate = require('./unlock.template');
const WaitingTemplate = require('./waiting.template');
const { ConfirmationWaitingUI } = require('../confirmation_waiting');

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
    this.pendingTxSignature = '';
    this.destinationPublicKey = '';
    this.blockedRoot = null;
    this.confirmationWaiting = null;

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

  openWaiting() {
    this.step = 'waiting';
    this.show(WaitingTemplate.pendingConfirmationOverlay({ extraClass: 'rs-unlock-waiting' }));
    this.bindWaitingEvents();
    this.confirmationWaiting = new ConfirmationWaitingUI(
      this.app,
      '.rs-unlock-waiting.rs-confirmation-waiting.is-pending'
    );
    this.confirmationWaiting.start();
  }

  openSuccess() {
    this.confirmationWaiting?.stop();
    this.confirmationWaiting = null;
    this.step = 'success';
    this.show(
      UnlockTemplate.waitingOverlay({
        destinationPublicKey: escapeHtml(this.destinationPublicKey)
      })
    );
    this.bindWaitingEvents();
  }

  show(html) {
    const container = document.querySelector('.saito-container');
    container?.classList.add('rs-publish-modal-open');
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
    this.confirmationWaiting?.stop();
    this.confirmationWaiting = null;
    document.querySelector('.saito-container')?.classList.remove('rs-publish-modal-open');
    document.removeEventListener('keydown', this.onEscapeKey);
    if (this.blockedRoot) {
      this.blockedRoot.inert = false;
      this.blockedRoot = null;
    }
    this.step = null;
    this.pendingTxSignature = '';
  }

  applyOverlayLayout() {
    const el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const backdrop = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);

    if (el) {
      el.classList.add('rs-publish-overlay-shell', 'maximized-overlay');
      el.style.pointerEvents = 'none';
    }
    if (backdrop) {
      backdrop.classList.add('rs-publish-overlay-backdrop');
      backdrop.style.display = 'block';
      backdrop.style.pointerEvents = 'auto';
      backdrop.style.top = '0';
      backdrop.style.left = '0';
      backdrop.style.width = '100vw';
      backdrop.style.height = '100dvh';
      backdrop.style.zIndex = '100001';
    }
    if (el) {
      el.style.zIndex = '100002';
    }
    if (typeof this.overlay.pullOverlayToFront === 'function') {
      this.overlay.pullOverlayToFront();
    }
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
        await this.mod.broadcastSolution({
          destinationPublicKey: destination,
          feeSaito: fee || '0'
        });
        this.openWaiting();
      } catch (err) {
        showError(err?.message || 'Could not broadcast the unlock transaction.');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'BROADCAST SOLUTION';
        }
      }
    });
  }

  bindWaitingEvents() {
    const root = document.querySelector('.rs-unlock-waiting');
    if (!root) {
      return;
    }

    root.querySelector('[data-action="unlock-new-script"]')?.addEventListener('click', () => {
      this.mod.resetUnlockWorkflow();
      this.hide();
      this.mainUi?.welcomeOverlay?.render('splash');
    });
  }

  async checkBlockForPendingTx(blk) {
    if (!this.pendingTxSignature || this.step !== 'waiting' || !blk) {
      return;
    }
    try {
      const txs = blk.transactions || [];
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (tx?.signature === this.pendingTxSignature) {
          this.onUnlockConfirmed();
          return;
        }
      }
      this.confirmationWaiting?.onNewBlockWithoutConfirmation();
    } catch (err) {
      // keep waiting
    }
  }

  onUnlockConfirmed() {
    if (this.step !== 'waiting') {
      return;
    }
    this.confirmationWaiting?.stop();
    this.confirmationWaiting = null;
    this.openSuccess();
  }

  handleConfirmation(blk, tx, conf) {
    if (Number(conf) !== 0) {
      return;
    }
    const txmsg = tx.returnMessage();
    if (txmsg?.module !== this.mod.name || txmsg?.request !== 'spend p2sh') {
      return;
    }
    if (this.pendingTxSignature && tx.signature !== this.pendingTxSignature) {
      return;
    }
    this.onUnlockConfirmed();
  }

  notePendingSignature(signature) {
    this.pendingTxSignature = signature || '';
  }
}

module.exports = UnlockFlow;
