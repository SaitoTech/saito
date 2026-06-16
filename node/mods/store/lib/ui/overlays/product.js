const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ProductTemplate = require('./product.template');
const Listing = require('../../listing');

class ProductOverlay {
	constructor(app, mod, product = null) {
		this.app = app;
		this.mod = mod;
		this.product = product;
		this.overlay = new SaitoOverlay(app, mod);

		this.app.connection.on('store-listing-updated', (listing) => {
			if (this.product?.signature && this.product.signature === listing.signature) {
				this.render(listing);
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

	returnCreatedDate(listing = {}) {
		const raw = listing.created_at || listing.createdAt || listing.timestamp || Date.now();
		const date = new Date(raw);
		if (Number.isNaN(date.getTime())) {
			return new Date().toLocaleDateString();
		}
		return date.toLocaleDateString();
	}

	hasCurrencyLabel(value = '') {
		return /[a-zA-Z]/.test(String(value));
	}

	returnProductType(listing = {}) {
		if (listing.type) {
			return listing.type;
		}
		if (listing.nft || listing.nft_id || listing.badge) {
			return 'NFT';
		}
		if (listing.delivery || listing.shipping || listing.physical) {
			return 'Physical';
		}
		return 'Digital';
	}

	returnViewModel(listing = {}) {
		const listingTitle = listing.returnTitle?.() || 'Untitled Item';
		const seller = listing.seller || 'anon-store';
		const shortSeller = this.returnShortKey(seller);

		const listingImage = listing.returnImage?.() || '';
		const cacheImageUrl = !listingImage ? listing.returnCacheImageUrl?.() || '' : '';

		const images = Array.isArray(listing.images)
			? listing.images.filter(Boolean)
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

		const priceValue = listing.price || listing.reserve_price || '';
		const bidValue = listing.current_bid || listing.currentBid || '';
		const isBid = !!bidValue && !priceValue;
		const primaryValue = isBid ? bidValue : priceValue || 'N/A';
		const primaryLabel = isBid ? 'Current Bid' : 'Price';
		const currency = listing.currency || listing.denomination || 'SAITO';
		const nextBid = listing.next_bid || listing.nextMinBid || '';
		const supply = listing.returnQuantity?.() || 1;
		const actionText = isBid ? 'Bid' : 'Buy';
		const description = listing.returnDescription?.() || '';
		const txid = String(listing.signature || 'N/A');
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
			productType: this.returnProductType(listing),
			fileType: this.returnFileType(normalizedImages),
			createdDate: this.returnCreatedDate(listing),
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
				const listing = this.product;
				if (!(listing instanceof Listing)) {
					return;
				}

				const qtyInput = document.querySelector('#store-product-qty-input');
				const quantity = qtyInput ? Number(qtyInput.value) || 1 : 1;

				if (buyBtn.disabled) {
					return;
				}
				buyBtn.disabled = true;

				try {
					await this.mod.purchase_flow?.startPurchase(listing, quantity);
				} finally {
					buyBtn.disabled = false;
				}
			};
		}
	}

	render(product = null) {
		if (product) {
			this.product = product;
		}
		const view = this.returnViewModel(this.product || {});
		this.overlay.show(ProductTemplate(view));
		this.attachEvents();
		if (!this.product?.image) {
			this.maybeLoadNFT();
		}
	}

	maybeLoadNFT() {
		const listing = this.product;
		if (!(listing instanceof Listing)) {
			return;
		}

		if (listing._store_image_fallback) {
			return;
		}

		if (listing.image) {
			return;
		}

		listing._store_image_fallback = true;

		listing.loadNFT((updated) => {
			if (updated?.image) {
				this.render(updated);
			}
		});
	}
}

module.exports = ProductOverlay;
