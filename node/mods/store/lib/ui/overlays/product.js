const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ProductTemplate = require('./product.template');
const { hydrateListingFromArchive } = require('../../listing-hydration');

class ProductOverlay {
	constructor(app, mod, product = {}) {
		this.app = app;
		this.mod = mod;
		this.product = product;
		this.overlay = new SaitoOverlay(app, mod);
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

	returnCreatedDate(product = {}) {
		const raw = product.created_at || product.createdAt || product.timestamp || Date.now();
		const date = new Date(raw);
		if (Number.isNaN(date.getTime())) {
			return new Date().toLocaleDateString();
		}
		return date.toLocaleDateString();
	}

	hasCurrencyLabel(value = '') {
		return /[a-zA-Z]/.test(String(value));
	}

	returnProductType(product = {}) {
		if (product.type) {
			return product.type;
		}
		if (product.nft || product.nft_id || product.badge) {
			return 'NFT';
		}
		if (product.delivery || product.shipping || product.physical) {
			return 'Physical';
		}
		return 'Digital';
	}

	returnViewModel(product = {}) {
		const listingTitle =
			product.title ?? product.nft_title ?? 'Untitled Item';
		const seller = product.seller || 'anon-store';
		const shortSeller = this.returnShortKey(seller);

		const images = Array.isArray(product.images)
			? product.images.filter(Boolean)
			: product.image
				? [product.image]
				: [];

		const fallbackImage =
			"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132736'/%3E%3Cstop offset='1' stop-color='%233c8fcb'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23g)'/%3E%3C/svg%3E";
		const normalizedImages =
			images.length > 0
				? images.map((img) => (img?.startsWith('gradient-') ? fallbackImage : img))
				: [fallbackImage];

		const priceValue = product.price || product.reserve_price || '';
		const bidValue = product.current_bid || product.currentBid || '';
		const isBid = !!bidValue && !priceValue;
		const primaryValue = isBid ? bidValue : priceValue || 'N/A';
		const primaryLabel = isBid ? 'Current Bid' : 'Price';
		const currency = product.currency || product.denomination || 'SAITO';
		const nextBid = product.next_bid || product.nextMinBid || '';
		const supply = Number(product.supply ?? product.quantity ?? 1) || 1;
		const actionText = isBid ? 'Bid' : 'Buy';
		const description = product.description ?? product.nft_description ?? '';
		const txid = String(product.tx_id || product.txid || product.id || 'N/A');
		const primaryDisplay = this.hasCurrencyLabel(primaryValue)
			? String(primaryValue)
			: `${primaryValue} ${currency}`;
		const nextBidDisplay = this.hasCurrencyLabel(nextBid)
			? String(nextBid)
			: `${nextBid} ${currency}`;

		return {
			identicon:
				this.app?.keychain?.returnIdenticon?.(seller || product.id) || '',
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
			productType: this.returnProductType(product),
			fileType: this.returnFileType(normalizedImages),
			createdDate: this.returnCreatedDate(product),
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

	}

	render(product = null) {
		if (product) {
			this.product = product;
		}
		const view = this.returnViewModel(this.product || {});
		this.overlay.show(ProductTemplate(view));
		this.attachEvents();
		this.maybeHydrateProductImage();
	}

	maybeHydrateProductImage() {
		const listing = this.product;
		if (!listing || listing.image != null) {
			return;
		}

		hydrateListingFromArchive(this.app, this.mod, listing, (updated) => {
			if (updated?.image != null) {
				this.render(updated);
			}
		});
	}
}

module.exports = ProductOverlay;
