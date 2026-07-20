const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PurchaseTemplate = require('./purchase.template');
const { ConfirmationWaitingUI } = require('../../../../rustscript/lib/ui/confirmation_waiting');
const { startPurchase } = require('../purchase-service');

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
		this.confirmationWaiting = null;

		this.app.connection.on('store-purchase-asset', (data) => {
			this.onStorePurchaseAsset(data);
		});
		this.app.connection.on('store-new-block', (data) => {
			this.onStoreNewBlock(data);
		});
	}

	async startPurchase(summary, quantity = 1) {
		return startPurchase(this.app, this.mod, this, summary, quantity);
	}

	render(step = 'waiting') {
		if (step === 'processing') {
			this.openProcessing();
			return;
		}
		this.openWaiting(this.listingTitle, this.pendingTxSignature);
	}

	openWaiting(listingTitle = '', pendingTxSignature = '') {
		this.listingTitle = listingTitle || this.listingTitle;
		this.pendingTxSignature = pendingTxSignature || this.pendingTxSignature;
		this.step = 'waiting';
		this.show(PurchaseTemplate.pendingOverlay({ listingTitle: this.listingTitle }));
		this.confirmationWaiting = new ConfirmationWaitingUI(this.app, '.purchase.pending');
		this.confirmationWaiting.start();
	}

	openProcessing() {
		this.confirmationWaiting?.stop();
		this.confirmationWaiting = null;
		this.step = 'processing';
		this.show(PurchaseTemplate.processingOverlay({ listingTitle: escapeHtml(this.listingTitle) }));
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
		this.step = null;
		this.pendingTxSignature = '';
		this.listingTitle = '';
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
		const root = document.querySelector('.purchase.confirmed');
		if (!root) {
			return;
		}
		root.querySelector('[data-action="purchase-close"]')?.addEventListener('click', () => {
			this.hide();
		});
	}

	onStoreNewBlock({ blk } = {}) {
		if (!this.pendingTxSignature || this.step !== 'waiting' || !blk) {
			return;
		}

		this.confirmationWaiting?.onNewBlockWithoutConfirmation();
	}

	onStorePurchaseAsset({ blk, tx, conf } = {}) {
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
		this.onPurchaseConfirmed();
	}

	onPurchaseConfirmed() {
		if (this.step !== 'waiting') {
			return;
		}
		this.openProcessing();
	}
}

module.exports = PurchaseOverlay;
