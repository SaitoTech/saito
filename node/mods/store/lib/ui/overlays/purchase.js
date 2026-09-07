const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PurchaseTemplate = require('./purchase.template');
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
    /** True while the shared Transaction Monitor owns payment confirmation UX. */
    this.watchingWithMonitor = false;

    this.app.connection.on('store-purchase-asset', (data) => {
      this.onStorePurchaseAsset(data);
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

  async startPurchase(summary, quantity = 1, opts = {}) {
    return startPurchase(this.app, this.mod, this, summary, quantity, opts);
  }

  render(step = 'fulfilling') {
    if (step === 'complete') {
      this.openComplete();
      return;
    }
    this.openFulfilling();
  }

  /**
   * Payment broadcast confirmation via shared Saito Transaction Monitor.
   * On confirm, auto-advances into Store fulfillment UX (NFT arrival).
   * Live UX only — not recreated after reload.
   */
  watchPurchase(tx, listingTitle = '', meta = {}) {
    if (!tx?.signature) {
      console.error('Store: watchPurchase requires a signed transaction');
      return;
    }
    if (!this.mod.transaction_monitor) {
      console.error('Store: transaction_monitor is not initialized');
      return;
    }

    this.listingTitle = listingTitle || this.listingTitle;
    this.pendingTxSignature = tx.signature;
    if (meta.nft_id) {
      this.nft_id = String(meta.nft_id);
    }
    if (meta.quantity) {
      this.quantity = Math.max(1, Number(meta.quantity) || 1);
    }

    this.step = 'waiting';
    this.watchingWithMonitor = true;

    const lead = this.listingTitle
      ? `Your purchase of ${this.listingTitle} is being broadcast to the Saito network.`
      : 'Your purchase is being broadcast to the Saito network.';

    this.mod.transaction_monitor.render({
      tx,
      title: 'Purchasing NFT',
      lead,
      subtitle: 'Waiting for confirmation...',
      auto_continue_on_confirm: true,
      callback: (result) => {
        this.watchingWithMonitor = false;
        if (result?.status === 'confirmed') {
          this.openFulfilling();
          return;
        }
        // Cancelled while waiting — lifecycle may still complete in background.
        this.step = null;
      }
    });
  }

  openFulfilling() {
    this.step = 'fulfilling';
    this.show(
      PurchaseTemplate.fulfillingOverlay({
        listingTitle: escapeHtml(this.listingTitle)
      })
    );
  }

  openComplete() {
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
    document.querySelector('.saito-container')?.classList.remove('store-purchase-modal-open');
    // Keep lifecycle / listing-hide / pendingTxSignature — only clear presentation step.
    this.step = null;
  }

  applyOverlayLayout() {
    const el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const backdrop = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);

    // Size to the panel (like SaitoTransactionMonitor). Do not force maximized-overlay —
    // that moves .saito-overlay-closebox to an inset position instead of the standard
    // top/right: -1rem hang-off used by SaitoOverlay.
    if (el) {
      el.classList.add('store-purchase-overlay-shell');
      el.classList.remove('maximized-overlay');
      el.style.pointerEvents = '';
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
  }

  openMyNfts() {
    const active = this.lifecycle()?.returnActivePurchase?.();
    if (active?.phase === PurchaseLifecycle.PHASE.COMPLETE) {
      this.lifecycle()?.dismiss(active.id);
    }
    this.hide();
    this.app.connection.emit('saito-nft-list-render-request');
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

    this.lifecycle()?.markPaymentConfirmed(this.pendingTxSignature);
    // Monitor auto-continues into openFulfilling via watchPurchase callback.
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
    if (this.watchingWithMonitor) {
      this.mod.transaction_monitor?.hide?.();
      this.watchingWithMonitor = false;
    }
    if (this.step) {
      this.hide();
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
      if (this.watchingWithMonitor) {
        this.mod.transaction_monitor?.hide?.();
        this.watchingWithMonitor = false;
      }
      if (this.step !== 'complete') {
        this.openComplete();
      }
      return;
    }

    // Fulfilling overlay opens automatically when payment confirms.
  }
}

module.exports = PurchaseOverlay;
