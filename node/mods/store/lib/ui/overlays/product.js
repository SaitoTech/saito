const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ProductTemplate = require('./product.template');
const Summary = require('../../summary');
const { DREAMSCAPE_PLACEHOLDER } = require('../../summary');
const { summaryBucketKey } = require('../summary-cache');

class ProductOverlay {
	constructor(app, mod, summary = null) {
		this.app = app;
		this.mod = mod;
		this.summary = summary;
		this.overlay = new SaitoOverlay(app, mod);

		this.app.connection.on('store-listing-updated', (summary) => {
			if (
				this.summary?.nft_id &&
				summaryBucketKey(this.summary.nft_id, this.summary.price) ===
					summaryBucketKey(summary.nft_id, summary.price)
			) {
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

		const display = summary.returnMediaDisplay?.() || {};
		const listingImage =
			display.backgroundImage ||
			(summary.hasLoadedImage?.() ? summary.returnImage?.() || '' : '');
		const placeholder =
			display.loading || display.innerHtml
				? ''
				: summary.returnPlaceholderImage?.() || DREAMSCAPE_PLACEHOLDER;
		const images = Array.isArray(summary.images)
			? summary.images.filter(Boolean)
			: [listingImage || placeholder];

		const normalizedImages = images.map((img) =>
			img?.startsWith?.('gradient-') ? DREAMSCAPE_PLACEHOLDER : img
		);

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
		const txid = String(summary.listing_signature || summary.nft_id || 'N/A');
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
			txidShort: this.returnShortKey(txid),
			imageLoading: summary.isImageLoading?.() ?? false
		};
	}

	applyProductMedia(summary = this.summary) {
		if (!(summary instanceof Summary)) {
			return;
		}

		const display = summary.returnMediaDisplay?.() || {};
		const media = document.querySelector('.store-product-media');
		const mainImage = document.querySelector('.store-product-main-image');
		if (!media) {
			return;
		}

		let content = media.querySelector('.store-product-media-content');
		if (display.loading) {
			return;
		}

		if (display.innerHtml) {
			if (mainImage) {
				mainImage.style.display = 'none';
			}
			if (!content) {
				content = document.createElement('div');
				content.className = 'store-product-media-content';
				content.style.cssText =
					'position:absolute;inset:0;overflow:hidden;padding:12px;display:flex;align-items:center;justify-content:center;';
				media.appendChild(content);
			}
			content.innerHTML = display.innerHtml;
			return;
		}

		if (content) {
			content.remove();
		}
		if (mainImage) {
			mainImage.style.display = '';
			if (display.backgroundImage) {
				mainImage.setAttribute('src', display.backgroundImage);
			}
		}
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
				const display = this.summary?.returnMediaDisplay?.() || {};
				if (display.innerHtml || display.loading) {
					return;
				}
				mainImage.onerror = null;
				this.beginOverlayEnrichment();
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
		this.applyProductMedia();
		this.beginOverlayEnrichment();
	}

	beginOverlayEnrichment() {
		const summary = this.summary;
		if (!(summary instanceof Summary)) {
			return;
		}

		const refreshIfNeeded = () => {
			this.render(summary);
			if (summary.isImageLoading?.()) {
				summary.enrichMedia(() => this.render(summary));
			}
		};

		if (summary.listing_tx) {
			if (summary.isImageLoading?.()) {
				summary.enrichMedia(() => this.render(summary));
			}
			return;
		}

		summary.ensureListingTransaction(refreshIfNeeded);
	}
}

module.exports = ProductOverlay;
