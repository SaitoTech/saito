const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ListingProgressTemplate = require('./listing-progress.template');
const { ConfirmationWaitingUI } = require('../../../../rustscript/lib/ui/confirmation_waiting');
const ListingLifecycle = require('../listing-lifecycle');

function escapeHtml(text = '') {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

class ListingProgressOverlay {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod, true, true, false);
		this.overlay.class = 'saito-overlay store-purchase-overlay-shell';
		this.overlay.clickBackdropToClose = false;
		this.overlay.nonBlocking = false;

		this.step = null;
		this.listingTxSignature = '';
		this.listingTitle = '';
		this.confirmationWaiting = null;

		this.app.connection.on('store-new-block', (data) => {
			this.onStoreNewBlock(data);
		});
		this.app.connection.on('store-listing-lifecycle', (entry) => {
			this.onLifecycleChange(entry);
		});
	}

	lifecycle() {
		return this.mod.listing_lifecycle || null;
	}

	openWaiting(listingTitle = '', listingTxSignature = '') {
		this.listingTitle = listingTitle || this.listingTitle;
		this.listingTxSignature = listingTxSignature || this.listingTxSignature;
		this.step = 'waiting';
		this.overlay.clickBackdropToClose = false;

		this.show(
			ListingProgressTemplate.pendingOverlay({
				listingTitle: escapeHtml(this.listingTitle)
			})
		);
		this.confirmationWaiting = new ConfirmationWaitingUI(this.app, '.listing-progress.pending');
		this.confirmationWaiting.start();
	}

	openComplete() {
		this.confirmationWaiting?.stop();
		this.confirmationWaiting = null;
		this.step = 'complete';
		this.overlay.clickBackdropToClose = true;
		this.show(ListingProgressTemplate.completeOverlay());
		this.attachEvents();
	}

	show(html) {
		const container = document.querySelector('.saito-container');
		container?.classList.add('store-purchase-modal-open');
		this.overlay.show(html, () => {
			this.onOverlayClosed();
		});
		this.applyOverlayLayout();
		this.bindBackdropClose();
	}

	hide() {
		if (!this.step) {
			return;
		}
		this.overlay.close();
	}

	dismissIfComplete() {
		const active = this.lifecycle()?.returnActiveListing?.();
		if (active?.phase === ListingLifecycle.PHASE.COMPLETE) {
			this.lifecycle()?.dismiss(active.id);
		}
	}

	onOverlayClosed() {
		if (this.step === 'complete') {
			this.dismissIfComplete();
		}
		this.confirmationWaiting?.stop();
		this.confirmationWaiting = null;
		document.querySelector('.saito-container')?.classList.remove('store-purchase-modal-open');
		this.step = null;
		this.overlay.clickBackdropToClose = false;
	}

	bindBackdropClose() {
		const backdrop = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);
		if (!backdrop) {
			return;
		}
		if (this.overlay.clickBackdropToClose) {
			backdrop.onclick = (e) => {
				e.preventDefault();
				this.hide();
			};
		} else {
			backdrop.onclick = () => {};
		}
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

		requestAnimationFrame(() => this.positionClosebox());
	}

	/**
	 * Place the standard Saito closebox slightly outside the dialog’s top-right,
	 * not inset inside the full-screen maximized shell.
	 */
	positionClosebox() {
		const el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
		const closebox = document.getElementById(`saito-overlay-closebox${this.overlay.ordinal}`);
		const panel = el?.querySelector('.listing-progress');
		if (!el || !closebox || !panel) {
			return;
		}

		const shellRect = el.getBoundingClientRect();
		const panelRect = panel.getBoundingClientRect();
		const offset = 10;

		closebox.style.top = `${panelRect.top - shellRect.top - offset}px`;
		closebox.style.right = `${shellRect.right - panelRect.right - offset}px`;
		closebox.style.left = 'auto';
		closebox.style.display = 'block';
		closebox.style.pointerEvents = 'auto';
	}

	attachEvents() {
		const root = document.querySelector('.listing-progress.complete');
		if (!root) {
			return;
		}

		root.querySelector('[data-action="listing-continue"]')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.hide();
		});
	}

	onStoreNewBlock({ blk } = {}) {
		if (!this.listingTxSignature || this.step !== 'waiting' || !blk) {
			return;
		}
		this.confirmationWaiting?.onNewBlockWithoutConfirmation();
	}

	onLifecycleChange(entry) {
		if (!entry) {
			return;
		}

		const matches =
			!this.listingTxSignature || entry.listing_signature === this.listingTxSignature;
		if (!matches) {
			return;
		}

		if (entry.phase === ListingLifecycle.PHASE.COMPLETE) {
			this.listingTitle = entry.title || this.listingTitle;
			this.listingTxSignature = entry.listing_signature;
			if (this.step !== 'complete') {
				this.openComplete();
			}
		}
	}
}

module.exports = ListingProgressOverlay;
