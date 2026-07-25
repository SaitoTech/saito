const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PurchaseTemplate = require('./purchase.template');
const { ConfirmationWaitingUI } = require('../../../../rustscript/lib/ui/confirmation_waiting');
const { startPurchase } = require('../purchase-service');
const PurchaseLifecycle = require('../purchase-lifecycle');

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class PurchaseOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay store-purchase-overlay-shell';
    this.overlay.clickBackdropToClose = false;
    this.overlay.nonBlocking = false;

    this.step = null;
    this.pendingTxSignature = '';
    this.listingTitle = '';
    this.nft_id = '';
    this.quantity = 1;
    this.confirmationWaiting = null;

    this.app.connection.on('store-purchase-asset', (data) => {
      this.onStorePurchaseAsset(data);
    });
    this.app.connection.on('store-new-block', (data) => {
      this.onStoreNewBlock(data);
    });
    this.app.connection.on('store-order-refund', () => {
      this.onStoreOrderRefund();
    });
    this.app.connection.on('store-purchase-lifecycle', (purchase) => {
      this.onLifecycleChange(purchase);
    });
  }

  lifecycle() {
    return this.mod.purchase_lifecycle || null;
  }

  async startPurchase(summary, quantity = 1) {
    return startPurchase(this.app, this.mod, this, summary, quantity);
  }

  render(step = 'waiting') {
    if (step === 'fulfilling' || step === 'processing') {
      this.openFulfilling();
      return;
    }
    if (step === 'complete') {
      this.openComplete();
      return;
    }
    this.openWaiting(this.listingTitle, this.pendingTxSignature);
  }

  openWaiting(listingTitle = '', pendingTxSignature = '', meta = {}) {
    this.listingTitle = listingTitle || this.listingTitle;
    this.pendingTxSignature = pendingTxSignature || this.pendingTxSignature;
    if (meta.nft_id) {
      this.nft_id = String(meta.nft_id);
    }
    if (meta.quantity) {
      this.quantity = Math.max(1, Number(meta.quantity) || 1);
    }

    this.step = 'waiting';
    this.show(
      PurchaseTemplate.pendingOverlay({
        listingTitle: escapeHtml(this.listingTitle)
      })
    );
    this.confirmationWaiting = new ConfirmationWaitingUI(this.app, '.purchase.pending');
    this.confirmationWaiting.start();
  }

  openFulfilling() {
    this.confirmationWaiting?.stop();
    this.confirmationWaiting = null;
    this.step = 'fulfilling';
    this.show(
      PurchaseTemplate.fulfillingOverlay({
        listingTitle: escapeHtml(this.listingTitle)
      })
    );
  }

  openComplete() {
    this.confirmationWaiting?.stop();
    this.confirmationWaiting = null;
    this.step = 'complete';
    this.show(
      PurchaseTemplate.completeOverlay({
        listingTitle: escapeHtml(this.listingTitle)
      })
    );
    this.attachEvents();
  }

  show(html) {
    const container = document.querySelector('.saito-container');
    container?.classList.add('store-purchase-modal-open');
    this.overlay.show(html, () => {
      this.onOverlayClosed();
    });
    this.applyOverlayLayout();
  }

  hide() {
    if (!this.step) {
      return;
    }
    this.overlay.close();
  }

  onOverlayClosed() {
    this.confirmationWaiting?.stop();
    this.confirmationWaiting = null;
    document.querySelector('.saito-container')?.classList.remove('store-purchase-modal-open');
    // Keep lifecycle / listing-hide / pendingTxSignature — only clear presentation step.
    this.step = null;
  }

  applyOverlayLayout() {
    const el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const backdrop = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);

    if (el) {
      el.classList.add('store-purchase-overlay-shell', 'maximized-overlay');
      el.style.pointerEvents = 'none';
    }
    if (backdrop) {
      backdrop.classList.add('store-purchase-overlay-backdrop');
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

  attachEvents() {
    const root = document.querySelector('.purchase.complete');
    if (!root) {
      return;
    }

    root.querySelector('[data-action="view-nfts"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openMyNfts();
    });

    root.querySelector('[data-action="purchase-close"]')?.addEventListener('click', () => {
      const active = this.lifecycle()?.returnActivePurchase?.();
      if (active?.phase === PurchaseLifecycle.PHASE.COMPLETE) {
        this.lifecycle()?.dismiss(active.id);
      }
      this.hide();
    });
  }

  openMyNfts() {
    const active = this.lifecycle()?.returnActivePurchase?.();
    if (active?.phase === PurchaseLifecycle.PHASE.COMPLETE) {
      this.lifecycle()?.dismiss(active.id);
    }
    this.hide();
    this.app.connection.emit('saito-nft-list-render-request');
  }

  onStoreNewBlock({ blk } = {}) {
    if (!this.pendingTxSignature || !blk) {
      return;
    }

    if (this.step === 'waiting') {
      this.confirmationWaiting?.onNewBlockWithoutConfirmation();
      const purchase = this.lifecycle()?.findByPurchaseTx(this.pendingTxSignature);
      if (purchase && purchase.phase === PurchaseLifecycle.PHASE.CONFIRMING) {
        this.lifecycle()?.setPhase(purchase.id, PurchaseLifecycle.PHASE.CONFIRMING, {
          status: 'Purchasing NFT…',
          detail: 'Waiting for next block…'
        });
      }
    }
  }

  onStorePurchaseAsset({ conf, tx } = {}) {
    if (Number(conf) !== 0) {
      return;
    }

    const txmsg = tx?.returnMessage?.() || {};
    if (txmsg.module !== 'Store' || txmsg.request !== 'purchase-asset') {
      return;
    }
    if (this.pendingTxSignature && tx.signature !== this.pendingTxSignature) {
      return;
    }
    this.onPaymentConfirmed();
  }

  onStoreOrderRefund() {
    const purchase = this.lifecycle()?.findByPurchaseTx(this.pendingTxSignature);
    if (!purchase) {
      return;
    }
    this.lifecycle()?.setPhase(purchase.id, PurchaseLifecycle.PHASE.DISMISSED, {
      status: 'Purchase refunded',
      detail: 'The Store could not fulfill this order.'
    });
    if (this.step) {
      this.hide();
    }
  }

  onPaymentConfirmed() {
    this.lifecycle()?.markPaymentConfirmed(this.pendingTxSignature);

    if (this.step === 'waiting') {
      this.openFulfilling();
    }
  }

  onLifecycleChange(purchase) {
    if (!purchase) {
      return;
    }

    const matches =
      !this.pendingTxSignature || purchase.purchase_tx_signature === this.pendingTxSignature;

    if (!matches) {
      return;
    }

    if (purchase.phase === PurchaseLifecycle.PHASE.COMPLETE) {
      this.listingTitle = purchase.title || this.listingTitle;
      this.pendingTxSignature = purchase.purchase_tx_signature;
      this.nft_id = purchase.nft_id;
      if (this.step !== 'complete') {
        this.openComplete();
      }
      return;
    }

    if (purchase.phase === PurchaseLifecycle.PHASE.FULFILLING && this.step === 'waiting') {
      this.openFulfilling();
    }
  }
}

module.exports = PurchaseOverlay;
