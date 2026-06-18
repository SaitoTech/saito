const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');

const LISTING_STATUS_ACTIVE = 1;
const LISTING_STATUS_INACTIVE = 0;

class Listing {
	constructor(app, mod, data = {}) {
		this.app = app;
		this.mod = mod;

		this.id = data.id || '';
		this.nft_id = data.nft_id || '';
		this.seller = data.seller || '';
		this.title = data.title || '';
		this.description = data.description || '';
		this.image = data.image ?? null;
		this.price = data.price ?? 0;
		this.quantity_total = data.quantity_total ?? data.quantity ?? 1;
		this.quantity_available = data.quantity_available ?? data.quantity ?? 1;
		this.quantity_reserved = data.quantity_reserved ?? 0;
		this.status = data.status ?? 1;
		this.created_at = data.created_at || 0;
		this.updated_at = data.updated_at || data.created_at || 0;
		this.subtitle = data.subtitle || '';
		this.badge = data.badge;
		this.nft = data.nft || null;
	}

	returnImage() {
		if (this.image) {
			return this.image;
		}
		return this.nft?.returnImage?.() || '';
	}

	returnCacheImageUrl() {
		if (!this.id || this.id.startsWith('store-demo-')) {
			return '';
		}
		const slug = this.mod?.returnSlug?.() || 'store';
		return `/${encodeURI(slug)}/cache/${this.id}.img`;
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
		return Number(this.status) === 1 && this.returnQuantity() > 0;
	}

	attachNFT(nft) {
		if (!nft) {
			return this;
		}
		this.nft = nft;
		if (!this.image) {
			const image = nft.returnImage?.();
			if (image) {
				this.image = image;
			}
		}
		return this;
	}

	loadNFT(onComplete = null) {
		if (this.image) {
			if (onComplete) {
				onComplete(this);
			}
			return;
		}

		if (this.nft) {
			this.attachNFT(this.nft);
			if (onComplete) {
				onComplete(this);
			}
			return;
		}

		if (!this.nft_id && !this.id) {
			if (onComplete) {
				onComplete(this);
			}
			return;
		}

		const nft = new SaitoNFT(this.app, this.mod, null, {
			id: this.nft_id,
			nft_id: this.nft_id,
			tx_sig: this.id
		});

		nft.fetchTransaction(() => {
			this.attachNFT(nft);
			if (this.image && this.app?.connection) {
				this.app.connection.emit('store-listing-updated', this);
			}
			if (onComplete) {
				onComplete(this);
			}
		});
	}

	serialize() {
		return {
			id: this.id,
			nft_id: this.nft_id,
			seller: this.seller,
			title: this.title,
			description: this.description,
			image: this.image,
			price: this.price,
			quantity_total: this.quantity_total,
			quantity_available: this.quantity_available,
			quantity_reserved: this.quantity_reserved,
			status: this.status,
			created_at: this.created_at,
			updated_at: this.updated_at,
			subtitle: this.subtitle,
			badge: this.badge
		};
	}
}

function returnDemoListings(app, mod) {
	const listings = [
		{
			id: 'store-demo-1',
			title: '3 SAITO',
			subtitle: 'Archival Series',
			price: 300000000,
			seller: 'anon-szuhff',
			image: 'gradient-1',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		},
		{
			id: 'store-demo-2',
			title: '5 SAITO',
			subtitle: 'Genesis Drop',
			price: 500000000,
			seller: 'anon-kx9pld',
			image: 'gradient-2',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		},
		{
			id: 'store-demo-3',
			title: '8 SAITO',
			subtitle: 'Creator Bundle',
			price: 800000000,
			seller: 'anon-vq2mtn',
			image: 'gradient-3',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		},
		{
			id: 'store-demo-4',
			title: '12 SAITO',
			subtitle: 'Community Special',
			price: 1200000000,
			seller: 'anon-hf7rqp',
			image: 'gradient-4',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		},
		{
			id: 'store-demo-5',
			title: '15 SAITO',
			subtitle: 'Founders Capsule',
			price: 1500000000,
			seller: 'anon-ly3gca',
			image: 'gradient-5',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		},
		{
			id: 'store-demo-6',
			title: '20 SAITO',
			subtitle: 'Limited Vault',
			price: 2000000000,
			seller: 'anon-nr8wse',
			image: 'gradient-6',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		},
		{
			id: 'store-demo-7',
			title: '25 SAITO',
			subtitle: 'Verified Set',
			price: 2500000000,
			seller: 'anon-bm4qzt',
			image: 'gradient-7',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		},
		{
			id: 'store-demo-8',
			title: '30 SAITO',
			subtitle: 'Collector Tier',
			price: 3000000000,
			seller: 'anon-pd1yuk',
			image: 'gradient-8',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		},
		{
			id: 'store-demo-9',
			title: '40 SAITO',
			subtitle: 'Premium Relay',
			price: 4000000000,
			seller: 'anon-tj6xev',
			image: 'gradient-9',
			badge: true,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		},
		{
			id: 'store-demo-10',
			title: '55 SAITO',
			subtitle: 'Legendary Pack',
			price: 5500000000,
			seller: 'anon-qw5nfr',
			image: 'gradient-10',
			badge: false,
			quantity_total: 1,
			quantity_available: 1,
			quantity_reserved: 0,
			status: LISTING_STATUS_ACTIVE
		}
	];

	return listings.map((data) => new Listing(app, mod, data));
}

module.exports = Listing;
module.exports.LISTING_STATUS_ACTIVE = LISTING_STATUS_ACTIVE;
module.exports.LISTING_STATUS_INACTIVE = LISTING_STATUS_INACTIVE;
module.exports.returnDemoListings = returnDemoListings;
