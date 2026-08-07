const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PurchaseMonitorTemplate = require('./purchase-monitor.template');

const STAGES = {
  preparing: {
    title: 'Preparing purchase',
    detail: 'Getting ready…'
  },
  checking_wallet: {
    title: 'Checking wallet',
    detail: 'Confirming your balance…'
  },
  creating: {
    title: 'Creating transaction',
    detail: 'Building and signing your payment…'
  },
  sending: {
    title: 'Sending transaction',
    detail: 'Broadcasting to the network…'
  }
};

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Covers the gap between Buy click and Transaction Monitor:
 * balance check, purchase tx construction/signing, and broadcast.
 * Instantiated once on Store (mod.purchase_monitor).
 */
class PurchaseMonitor {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay store-purchase-overlay-shell';
    this.overlay.clickBackdropToClose = false;
    this.overlay.nonBlocking = false;

    this.active = false;
    this.stage = null;
    this.listingTitle = '';
  }

  /**
   * Open preparation UI. Replaces listing-detail as the active blocking surface.
   */
  show({ listingTitle = '' } = {}) {
    this.listingTitle = String(listingTitle || '').trim();
    this.active = true;
    this.stage = 'preparing';

    const stage = STAGES.preparing;
    this._showHtml(
      PurchaseMonitorTemplate.panel({
        listingTitle: escapeHtml(this.listingTitle),
        stageTitle: escapeHtml(stage.title),
        stageDetail: escapeHtml(stage.detail)
      })
    );
  }

  /**
   * Update the visible stage label. No-op if not active.
   * @param {keyof typeof STAGES} stageKey
   */
  setStage(stageKey = 'preparing') {
    if (!this.active) {
      return;
    }

    const stage = STAGES[stageKey] || STAGES.preparing;
    this.stage = stageKey;

    const titleEl = document.querySelector(
      `#saito-overlay${this.overlay.ordinal} [data-monitor-stage-title]`
    );
    const detailEl = document.querySelector(
      `#saito-overlay${this.overlay.ordinal} [data-monitor-stage-detail]`
    );

    if (titleEl) {
      titleEl.textContent = stage.title;
    }
    if (detailEl) {
      detailEl.textContent = stage.detail;
    }

    // Overlay not in DOM yet — re-show with current stage.
    if (!titleEl && this.active) {
      this._showHtml(
        PurchaseMonitorTemplate.panel({
          listingTitle: escapeHtml(this.listingTitle),
          stageTitle: escapeHtml(stage.title),
          stageDetail: escapeHtml(stage.detail)
        })
      );
    }
  }

  hide() {
    if (!this.active && !this.overlay.visible) {
      return;
    }
    this.active = false;
    this.stage = null;
    this.overlay.close();
    document.querySelector('.saito-container')?.classList.remove('store-purchase-modal-open');
  }

  _showHtml(html) {
    const container = document.querySelector('.saito-container');
    container?.classList.add('store-purchase-modal-open');
    this.overlay.show(html, () => {
      this.onOverlayClosed();
    });
    this.applyOverlayLayout();
  }

  onOverlayClosed() {
    this.active = false;
    this.stage = null;
    document.querySelector('.saito-container')?.classList.remove('store-purchase-modal-open');
  }

  applyOverlayLayout() {
    const el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    if (el) {
      el.classList.add('store-purchase-overlay-shell', 'maximized-overlay');
    }
    const backdrop = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);
    if (backdrop) {
      backdrop.classList.add('store-purchase-overlay-backdrop');
    }
  }
}

PurchaseMonitor.STAGES = STAGES;

module.exports = PurchaseMonitor;
