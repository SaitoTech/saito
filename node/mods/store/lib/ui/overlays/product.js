const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ProductTemplate = require('./product.template');
const Summary = require('../../summary');

class ProductOverlay {
	constructor(app, mod, summary = null) {
		this.app = app;
		this.mod = mod;
		this.summary = summary;
		this.overlay = new SaitoOverlay(app, mod);

		this.app.connection.on('store-listing-updated', (summary) => {
			if (this.summary?.id && this.summary.id === summary.id) {
				this.render(summary);
			}
		});
	}

	returnShortKey(key = '') {
		if (!key) {
			return 'anon-store';
		}
		if (key.length <= 18) {
			return key;
		}
		return `${key.slice(0, 8)}...${key.slice(-8)}`;
	}

	returnFileType(images = []) {
		const sample = images[0] || '';
		if (!sample) {
			return 'unknown';
		}
		if (sample.startsWith('data:image/')) {
			return 'image';
		}
		const ext = sample.split('?')[0].split('.').pop()?.toLowerCase() || '';
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) {
			return `image/${ext}`;
		}
		return ext || 'unknown';
	}

	returnCreatedDate(summary = {}) {
		const raw = summary.created_at || summary.createdAt || summary.timestamp || Date.now();
		const date = new Date(raw);
		if (Number.isNaN(date.getTime())) {
			return new Date().toLocaleDateString();
		}
		return date.toLocaleDateString();
	}

	hasCurrencyLabel(value = '') {
		return /[a-zA-Z]/.test(String(value));
	}

	returnProductType(summary = {}) {
		if (summary.type) {
			return summary.type;
		}
		if (summary.nft || summary.nft_id || summary.badge) {
			return 'NFT';
		}
		if (summary.delivery || summary.shipping || summary.physical) {
			return 'Physical';
		}
		return 'Digital';
	}

	returnViewModel(summary = {}) {
		const listingTitle = summary.returnTitle?.() || 'Untitled Item';
		const seller = summary.seller || 'anon-store';
		const shortSeller = this.returnShortKey(seller);

		const listingImage = summary.returnImage?.() || '';
		const cacheImageUrl = !listingImage ? summary.returnCacheImageUrl?.() || '' : '';

		const images = Array.isArray(summary.images)
			? summary.images.filter(Boolean)
			: listingImage
				? [listingImage]
				: cacheImageUrl
					? [cacheImageUrl]
					: [];

		const fallbackImage =
			"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132736'/%3E%3Cstop offset='1' stop-color='%233c8fcb'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23g)'/%3E%3C/svg%3E";
		const normalizedImages =
			images.length > 0
				? images.map((img) => (img?.startsWith('gradient-') ? fallbackImage : img))
				: [fallbackImage];

		const priceValue = summary.returnPrice?.() || summary.price || summary.reserve_price || '';
		const bidValue = summary.current_bid || summary.currentBid || '';
		const isBid = !!bidValue && !priceValue;
		const primaryValue = isBid ? bidValue : priceValue || 'N/A';
		const primaryLabel = isBid ? 'Current Bid' : 'Price';
		const currency = summary.currency || summary.denomination || 'SAITO';
		const nextBid = summary.next_bid || summary.nextMinBid || '';
		const supply = summary.returnQuantity?.() || 1;
		const actionText = isBid ? 'Bid' : 'Buy';
		const description = summary.returnDescription?.() || '';
		const txid = String(summary.id || 'N/A');
		const primaryDisplay = this.hasCurrencyLabel(primaryValue)
			? String(primaryValue)
			: `${primaryValue} ${currency}`;
		const nextBidDisplay = this.hasCurrencyLabel(nextBid)
			? String(nextBid)
			: `${nextBid} ${currency}`;

		return {
			identicon: this.app?.keychain?.returnIdenticon?.(seller) || '',
			listingTitle,
			seller,
			shortSeller,
			images: normalizedImages,
			hasGallery: normalizedImages.length > 1,
			primaryLabel,
			primaryDisplay,
			nextBid,
			showNextBid: !!nextBid,
			nextBidDisplay,
			supply,
			showQuantity: supply > 1,
			actionText,
			description,
			hasDescription: !!description,
			productType: this.returnProductType(summary),
			fileType: this.returnFileType(normalizedImages),
			createdDate: this.returnCreatedDate(summary),
			txidShort: this.returnShortKey(txid)
		};
	}

	attachEvents() {
		const mainImage = document.querySelector('.store-product-main-image');
		const thumbs = document.querySelectorAll('.store-product-thumb');
		thumbs.forEach((thumb) => {
			thumb.onclick = (e) => {
				e.preventDefault();
				const src = thumb.getAttribute('data-src');
				if (mainImage && src) {
					mainImage.setAttribute('src', src);
				}
				document.querySelectorAll('.store-product-thumb').forEach((n) => n.classList.remove('active'));
				thumb.classList.add('active');
			};
		});

		if (mainImage) {
			mainImage.onerror = () => {
				mainImage.onerror = null;
				this.maybeLoadNFT();
			};
		}

		const buyBtn = document.querySelector('.store-product-buy');
		if (buyBtn) {
			buyBtn.onclick = async (e) => {
				e.preventDefault();
				const summary = this.summary;
				if (!(summary instanceof Summary)) {
					return;
				}

				const qtyInput = document.querySelector('#store-product-qty-input');
				const quantity = qtyInput ? Number(qtyInput.value) || 1 : 1;

				if (buyBtn.disabled) {
					return;
				}
				buyBtn.disabled = true;

				try {
					await this.mod.main?.purchase_flow?.startPurchase(summary, quantity);
				} finally {
					buyBtn.disabled = false;
				}
			};
		}
	}

	render(summary = null) {
		if (summary) {
			this.summary = summary;
		}
		const view = this.returnViewModel(this.summary || {});
		this.overlay.show(ProductTemplate(view));
		this.attachEvents();
		if (!this.summary?.image) {
			this.maybeLoadNFT();
		}
	}

	maybeLoadNFT() {
		const summary = this.summary;
		if (!(summary instanceof Summary)) {
			return;
		}

		if (summary._store_image_fallback) {
			return;
		}

		if (summary.image) {
			return;
		}

		summary._store_image_fallback = true;

		summary.loadNFT((updated) => {
			if (updated?.image) {
				this.render(updated);
			}
		});
	}
}

module.exports = ProductOverlay;
