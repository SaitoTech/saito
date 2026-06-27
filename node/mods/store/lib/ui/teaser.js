const TeaserTemplate = require('./teaser.template');
const Listing = require('../listing');

class Teaser {
	constructor(app, mod, listing = null, container = '') {
		this.app = app;
		this.mod = mod;
		this.listing = listing;
		this.container = container;
		this.cardId = `store-teaser-${this.listing?.id || 'item'}`;
	}

	static updateMedia(app, listing) {
		if (!(listing instanceof Listing) || !listing.id) {
			return;
		}

		const image = listing.returnImage();
		if (!image) {
			return;
		}

		Teaser.updateMediaFromUrl(app, listing.id, image);
	}

	static updateMediaFromUrl(app, listing_id, image_url = '') {
		if (!listing_id || !image_url) {
			return;
		}

		const card = document.querySelector(`#store-teaser-${listing_id} .teaser-media`);
		if (!card) {
			return;
		}

		card.classList.remove(
			'gradient-1',
			'gradient-2',
			'gradient-3',
			'gradient-4',
			'gradient-5',
			'gradient-6',
			'gradient-7',
			'gradient-8',
			'gradient-9',
			'gradient-10'
		);
		card.classList.add('has-image');
		card.style.background = `url(${image_url}) center / cover no-repeat`;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container || !(this.listing instanceof Listing)) {
			return;
		}

		const image = this.listing.returnImage();
		const mediaClass = this.returnMediaClass(image);
		const mediaBackground = this.returnMediaBackground(image);
		const badgeClass = this.listing.badge ? '' : 'hidden';
		const identicon = this.app.keychain.returnIdenticon(this.listing.seller || '');
		const templateData = {
			title: this.listing.returnTitle(),
			subtitle: this.listing.subtitle || '',
			seller: this.listing.seller || '',
			identicon,
			show_buy_now:
				this.listing.show_buy_now ??
				this.listing.can_buy ??
				this.listing.badge ??
				false
		};

		this.app.browser.addElementToSelector(
			TeaserTemplate(templateData, this.cardId, mediaClass, mediaBackground, badgeClass),
			this.container
		);
		this.attachEvents();
		this.tryCacheImage();
	}

	tryCacheImage() {
		if (this.listing.image) {
			return;
		}

		const cache_url = this.listing.returnCacheImageUrl?.();
		if (!cache_url) {
			this.maybeLoadNFT();
			return;
		}

		const img = new Image();
		img.onload = () => {
			Teaser.updateMediaFromUrl(this.app, this.listing.id, cache_url);
		};
		img.onerror = () => {
			this.maybeLoadNFT();
		};
		img.src = cache_url;
	}

	maybeLoadNFT() {
		if (this.listing.image) {
			return;
		}

		this.listing.loadNFT();
	}

	returnMediaClass(image = '') {
		if (!image) {
			return 'gradient-1';
		}
		if (image.startsWith('gradient-')) {
			return image;
		}
		return 'has-image';
	}

	returnMediaBackground(image = '') {
		if (!image || image.startsWith('gradient-')) {
			return this.returnGradientForClass(this.returnMediaClass(image));
		}
		return `url(${image}) center / cover no-repeat`;
	}

	returnGradientForClass(mediaClass = 'gradient-1') {
		const gradients = {
			'gradient-1': 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
			'gradient-2': 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
			'gradient-3': 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
			'gradient-4': 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
			'gradient-5': 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
			'gradient-6': 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
			'gradient-7': 'linear-gradient(135deg, #22c55e 0%, #3b82f6 100%)',
			'gradient-8': 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
			'gradient-9': 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
			'gradient-10': 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)'
		};
		return gradients[mediaClass] || gradients['gradient-1'];
	}

	attachEvents() {
		const teaserCard = document.querySelector(`#${this.cardId}`);
		if (teaserCard) {
			teaserCard.onclick = (e) => {
				e.preventDefault();
				if (this.mod.main?.product_overlay) {
					this.mod.main.product_overlay.render(this.listing);
				}
			};
		}
	}
}

module.exports = Teaser;
