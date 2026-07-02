const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PurchaseTemplate = require('./purchase.template');
const { ConfirmationWaitingUI } = require('../../../../rustscript/lib/ui/confirmation_waiting');
const { isDemoNftId } = require('../../summary-media');

function parseListingUnitPrice(price = '') {
	const match = String(price).match(/[\d.]+/);
	return match ? match[0] : null;
}

function escapeHtml(text = '') {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

class PurchaseFlow {
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
		console.log('========================================================');
		console.log('=============== STORE PURCHASE START ===================');
		console.log('listing:', summary?.nft_id);
		console.log('title:', summary?.returnTitle?.() || summary?.title);
		console.log('========================================================');

		if (!summary?.nft_id || isDemoNftId(summary.nft_id)) {
			salert('This item is not available for purchase.');
			return;
		}

		if (!this.mod.store_public_key) {
			salert('Store is not connected. Please wait for the Store service to come online.');
			return;
		}

		const unit_price = parseListingUnitPrice(summary.returnPrice?.() || summary.price);
		if (!unit_price || Number(unit_price) <= 0) {
			salert('This item does not have a valid price.');
			return;
		}

		quantity = Math.max(1, Math.min(Number(quantity) || 1, summary.returnQuantity?.() || 1));
		const fee = String(this.mod.fee || 0);
		const unit_nolan = BigInt(this.app.wallet.convertSaitoToNolan(unit_price) ?? 0);
		const fee_nolan = BigInt(this.app.wallet.convertSaitoToNolan(fee) ?? 0);
		const total_nolan = unit_nolan * BigInt(quantity) + fee_nolan;

		if (total_nolan <= 0n) {
			salert('Unable to calculate purchase total.');
			return;
		}

		console.log('BUY 01 before wallet.getBalance()');
		const wallet_balance = await this.app.wallet.getBalance();
		console.log('BUY 02 after wallet.getBalance()', wallet_balance);

		this.listingTitle = summary.returnTitle?.() || summary.title || 'this item';

		let newtx = null;
		try {
			console.log('BUY 03 before createPurchaseAssetTransaction()', {
				nft_id: summary?.nft_id,
				price: summary?.price,
				quantity,
				total_nolan: total_nolan.toString()
			});
			newtx = await this.mod.createPurchaseAssetTransaction(
				summary,
				{ price: unit_price, fee, quantity },
				total_nolan
			);
			console.log('BUY 04 after createPurchaseAssetTransaction()', {
				signature: newtx?.signature
			});
		} catch (err) {
			console.error('Store: createPurchaseAssetTransaction failed', err);
			salert(err?.message || 'Could not create purchase transaction.');
			return;
		}

		console.log('BUY 05 transaction created and signed', { signature: newtx.signature });

		this.pendingTxSignature = newtx.signature || '';
		if (!this.pendingTxSignature) {
			salert('Purchase transaction was not signed.');
			return;
		}

		console.log('BUY 06 before product overlay hide');
		this.mod.main?.product_overlay?.overlay?.hide?.();
		console.log('BUY 07 after product overlay hide');

		if (wallet_balance < total_nolan) {
			console.log('BUY 08 insufficient balance — launching saito-purchase-launch', {
				signature: newtx.signature,
				wallet_balance: wallet_balance.toString(),
				total_nolan: total_nolan.toString()
			});
			this.app.connection.emit(
				'saito-purchase-launch',
				this.app.wallet.convertNolanToSaito(total_nolan),
				this.mod.store_public_key,
				newtx.serialize_to_web(this.app),
				`Purchase ${summary.returnTitle?.() || 'Store item'}`
			);
			console.log('BUY 09 before openWaiting() (insufficient balance path)', {
				signature: newtx.signature
			});
			this.openWaiting();
			console.log('BUY 10 after openWaiting() (insufficient balance path)', {
				signature: newtx.signature
			});
			return;
		}

		try {
			console.log('BUY 11 before network.propagateTransaction()', {
				signature: newtx.signature
			});
			await this.app.network.propagateTransaction(newtx);
			console.log('BUY 12 after network.propagateTransaction()', {
				signature: newtx.signature
			});
		} catch (err) {
			salert(err?.message || 'Could not submit purchase transaction.');
			this.pendingTxSignature = '';
			return;
		}

		console.log('BUY 13 before openWaiting() (propagate path)', {
			signature: newtx.signature
		});
		this.openWaiting();
		console.log('BUY 14 after openWaiting() (propagate path)', {
			signature: newtx.signature
		});
	}

	openWaiting() {
		console.log('BUY openWaiting() enter', { pendingTxSignature: this.pendingTxSignature });
		this.step = 'waiting';
		this.show(PurchaseTemplate.pendingOverlay({ listingTitle: this.listingTitle }));
		this.confirmationWaiting = new ConfirmationWaitingUI(
			this.app,
			'.store-purchase-waiting.is-pending'
		);
		this.confirmationWaiting.start();
		console.log('BUY openWaiting() exit', { pendingTxSignature: this.pendingTxSignature });
	}

	openProcessing() {
		this.confirmationWaiting?.stop();
		this.confirmationWaiting = null;
		this.step = 'processing';
		this.show(PurchaseTemplate.processingOverlay({ listingTitle: escapeHtml(this.listingTitle) }));
		this.bindProcessingEvents();
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

	bindProcessingEvents() {
		const root = document.querySelector('.store-purchase-waiting.is-processing');
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

module.exports = PurchaseFlow;
