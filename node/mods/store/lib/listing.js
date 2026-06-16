const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');

class Listing {
	constructor(app, mod, data = {}) {
		this.app = app;
		this.mod = mod;

		// Map persistence / wire field names at construction only.
		this.signature = data.signature || '';
		this.nft_id = data.nft_id || '';
		this.seller = data.seller || '';
		this.title = data.title || '';
		this.description = data.description || '';
		this.image = data.image ?? null;
		this.price = data.price ?? data.reserve_price ?? '';
		this.reserve_price = this.price;
		this.denomination = data.denomination || 'SAITO';
		this.quantity = data.quantity ?? 1;
		this.status = data.status ?? 1;
		this.onchain = data.onchain ?? 1;
		this.block_id = data.block_id ?? 0;
		this.block_hash = data.block_hash || '';
		this.transaction_id = data.transaction_id ?? 0;
		this.slip_id = data.slip_id ?? 0;
		this.created_at = data.created_at || 0;
		this.updated_at = data.updated_at || data.created_at || 0;
		this.access_hash = data.access_hash || '';
		this.access_script = data.access_script || '';
		this.pay_descriptor = data.pay_descriptor || '';
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
		if (!this.signature || this.signature.startsWith('store-demo-')) {
			return '';
		}
		const slug = this.mod?.returnSlug?.() || 'store';
		return `/${encodeURI(slug)}/cache/${this.signature}.img`;
	}

	returnTitle() {
		return this.title || this.nft?.title || 'Untitled Item';
	}

	returnDescription() {
		return this.description ?? this.nft?.description ?? '';
	}

	returnQuantity() {
		return Number(this.quantity ?? 1) || 1;
	}

	isActive() {
		return Number(this.status) === 1 && Number(this.onchain ?? 1) === 1;
	}

	isOnChain() {
		return Number(this.onchain ?? 1) === 1;
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

		if (!this.nft_id && !this.signature) {
			if (onComplete) {
				onComplete(this);
			}
			return;
		}

		const nft = new SaitoNFT(this.app, this.mod, null, {
			id: this.nft_id,
			nft_id: this.nft_id,
			tx_sig: this.signature
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
			signature: this.signature,
			nft_id: this.nft_id,
			seller: this.seller,
			title: this.title,
			description: this.description,
			image: this.image,
			price: this.price,
			quantity: this.quantity,
			status: this.status,
			onchain: this.onchain,
			block_id: this.block_id,
			block_hash: this.block_hash,
			transaction_id: this.transaction_id,
			slip_id: this.slip_id,
			created_at: this.created_at,
			updated_at: this.updated_at,
			access_hash: this.access_hash,
			access_script: this.access_script,
			pay_descriptor: this.pay_descriptor,
			denomination: this.denomination,
			subtitle: this.subtitle,
			badge: this.badge
		};
	}
}

module.exports = Listing;
