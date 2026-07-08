const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const {
	DREAMSCAPE_PLACEHOLDER,
	isDemoNftId,
	ensureListingTransaction,
	enrichSummaryMedia
} = require('./summary-media');

const SUMMARY_STATUS_ACTIVE = 1;
const SUMMARY_STATUS_INACTIVE = 0;

class Summary {
	constructor(app, mod, data = {}) {
		this.app = app;
		this.mod = mod;

		this.id = data.id ?? 0;
		this.nft_id = data.nft_id || '';
		this.seller = data.seller || '';
		this.title = data.title || '';
		this.description = data.description || '';
		this.image = data.image ?? null;
		this.price = data.price ?? 0;
		this.quantity_available = data.quantity_available ?? data.quantity ?? 0;
		this.quantity_total = data.quantity_total ?? Number(this.quantity_available);
		this.status = data.status ?? SUMMARY_STATUS_ACTIVE;
		this.updated_at = data.updated_at || 0;
		this.subtitle = data.subtitle || '';
		this.badge = data.badge;
		this.nft = data.nft || null;
		this.listing_signature = data.listing_signature || '';
		this.listing_tx = data.listing_tx || null;
		this._image_source = data._image_source || null;
		this._media_enriched = data._media_enriched || false;
	}

	isDemo() {
		return isDemoNftId(this.nft_id);
	}

	returnPlaceholderImage() {
		if (this.isDemo() && this.image?.startsWith?.('gradient-')) {
			return this.image;
		}
		return DREAMSCAPE_PLACEHOLDER;
	}

	isImageLoading() {
		if (this.isDemo()) {
			return false;
		}
		return this.returnMediaDisplay().loading;
	}

	hasLoadedImage() {
		return !!this.image;
	}

	returnMediaDisplay() {
		if (this.isDemo()) {
			return {
				backgroundImage: '',
				innerHtml: '',
				loading: false,
				failed: false
			};
		}

		if (this.nft?.returnMediaDisplay) {
			const display = this.nft.returnMediaDisplay();
			if (!display.loading || !this._media_enriched) {
				return display;
			}
		}

		if (this.image) {
			return {
				backgroundImage: this.image,
				innerHtml: '',
				loading: false,
				failed: false
			};
		}

		if (this._media_enriched) {
			return {
				backgroundImage: this.returnPlaceholderImage(),
				innerHtml: '',
				loading: false,
				failed: false
			};
		}

		return {
			backgroundImage: '',
			innerHtml: '',
			loading: true,
			failed: false
		};
	}

	returnImage() {
		if (this.image) {
			return this.image;
		}
		const nft_image = this.nft?.returnImage?.() || '';
		if (nft_image) {
			return nft_image;
		}
		return this.returnPlaceholderImage();
	}

	returnCacheImageUrl() {
		const nft_id = String(this.nft_id ?? '');
		if (!nft_id || this.isDemo()) {
			return '';
		}
		const slug = this.mod?.returnSlug?.() || 'store';
		return `/${encodeURI(slug)}/cache/${encodeURIComponent(nft_id)}.img`;
	}

	returnTitle() {
		return this.title || this.nft?.title || 'Untitled Item';
	}

	returnDescription() {
		return this.description ?? this.nft?.description ?? '';
	}

	returnQuantity() {
		return Number(this.quantity_available ?? 0) || 0;
	}

	returnPrice() {
		const nolan = BigInt(this.price ?? 0);
		if (nolan > 0n && this.app?.wallet?.convertNolanToSaito) {
			return `${this.app.wallet.convertNolanToSaito(nolan)} SAITO`;
		}
		return String(this.price ?? '');
	}

	isActive() {
		return Number(this.quantity_available ?? 0) > 0;
	}

	attachNFT(nft) {
		if (!nft) {
			return this;
		}
		this.nft = nft;
		if (!this.image) {
			const image = nft.returnImage?.() || '';
			if (image) {
				this.image = image;
			}
		}
		return this;
	}

	ensureListingTransaction(onComplete = null) {
		const done = (summary) => {
			if (onComplete) {
				onComplete(summary);
			}
			return summary;
		};

		return ensureListingTransaction(this).then(done);
	}

	enrichMedia(onComplete = null) {
		const done = (summary) => {
			if (onComplete) {
				onComplete(summary);
			}
			return summary;
		};

		return enrichSummaryMedia(this).then(done);
	}

	serialize() {
		return {
			nft_id: this.nft_id,
			seller: this.seller,
			title: this.title,
			description: this.description,
			listing_signature: this.listing_signature || '',
			price: this.price,
			quantity_total: this.quantity_total,
			quantity_available: this.quantity_available,
			status: this.status,
			updated_at: this.updated_at,
			subtitle: this.subtitle,
			badge: this.badge
		};
	}
}

function returnDemoSummaries(app, mod) {
	const rows = [
		{
			nft_id: 'store-demo-1',
			title: '3 SAITO',
			subtitle: 'Archival Series',
			price: 300000000,
			seller: 'anon-szuhff',
			image: 'gradient-1',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		},
		{
			nft_id: 'store-demo-2',
			title: '5 SAITO',
			subtitle: 'Genesis Drop',
			price: 500000000,
			seller: 'anon-kx9pld',
			image: 'gradient-2',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		},
		{
			nft_id: 'store-demo-3',
			title: '8 SAITO',
			subtitle: 'Creator Bundle',
			price: 800000000,
			seller: 'anon-vq2mtn',
			image: 'gradient-3',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		},
		{
			nft_id: 'store-demo-4',
			title: '12 SAITO',
			subtitle: 'Community Special',
			price: 1200000000,
			seller: 'anon-hf7rqp',
			image: 'gradient-4',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		},
		{
			nft_id: 'store-demo-5',
			title: '15 SAITO',
			subtitle: 'Founders Capsule',
			price: 1500000000,
			seller: 'anon-ly3gca',
			image: 'gradient-5',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		},
		{
			nft_id: 'store-demo-6',
			title: '20 SAITO',
			subtitle: 'Limited Vault',
			price: 2000000000,
			seller: 'anon-nr8wse',
			image: 'gradient-6',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		},
		{
			nft_id: 'store-demo-7',
			title: '25 SAITO',
			subtitle: 'Verified Set',
			price: 2500000000,
			seller: 'anon-bm4qzt',
			image: 'gradient-7',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		},
		{
			nft_id: 'store-demo-8',
			title: '30 SAITO',
			subtitle: 'Collector Tier',
			price: 3000000000,
			seller: 'anon-pd1yuk',
			image: 'gradient-8',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		},
		{
			nft_id: 'store-demo-9',
			title: '40 SAITO',
			subtitle: 'Premium Relay',
			price: 4000000000,
			seller: 'anon-tj6xev',
			image: 'gradient-9',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		},
		{
			nft_id: 'store-demo-10',
			title: '55 SAITO',
			subtitle: 'Legendary Pack',
			price: 5500000000,
			seller: 'anon-qw5nfr',
			image: 'gradient-10',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: SUMMARY_STATUS_ACTIVE
		}
	];

	return rows.map((data) => new Summary(app, mod, data));
}

module.exports = Summary;
module.exports.SUMMARY_STATUS_ACTIVE = SUMMARY_STATUS_ACTIVE;
module.exports.SUMMARY_STATUS_INACTIVE = SUMMARY_STATUS_INACTIVE;
module.exports.DREAMSCAPE_PLACEHOLDER = DREAMSCAPE_PLACEHOLDER;
module.exports.returnDemoSummaries = returnDemoSummaries;
