const TeaserTemplate = require('./teaser.template');
const Summary = require('../summary');

class Teaser {
	constructor(app, mod, summary = null, container = '') {
		this.app = app;
		this.mod = mod;
		this.summary = summary;
		this.container = container;
		this.cardId = `store-teaser-${this.summary?.id || 'item'}`;
	}

	static updateMedia(app, summary) {
		if (!(summary instanceof Summary) || !summary.id) {
			return;
		}

		const image = summary.returnImage();
		if (!image) {
			return;
		}

		Teaser.updateMediaFromUrl(app, summary.id, image);
	}

	static updateMediaFromUrl(app, summary_id, image_url = '') {
		if (!summary_id || !image_url) {
			return;
		}

		const card = document.querySelector(`#store-teaser-${summary_id} .teaser-media`);
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

		if (!this.container || !(this.summary instanceof Summary)) {
			return;
		}

		const image = this.summary.returnImage();
		const mediaClass = this.returnMediaClass(image);
		const mediaBackground = this.returnMediaBackground(image);
		const badgeClass = this.summary.badge ? '' : 'hidden';
		const identicon = this.app.keychain.returnIdenticon(this.summary.seller || '');
		const templateData = {
			title: this.summary.returnTitle(),
			subtitle: this.summary.subtitle || '',
			seller: this.summary.seller || '',
			identicon,
			show_buy_now:
				this.summary.show_buy_now ??
				this.summary.can_buy ??
				this.summary.badge ??
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
		if (this.summary.image) {
			return;
		}

		const cache_url = this.summary.returnCacheImageUrl?.();
		if (!cache_url) {
			this.maybeLoadNFT();
			return;
		}

		const img = new Image();
		img.onload = () => {
			Teaser.updateMediaFromUrl(this.app, this.summary.id, cache_url);
		};
		img.onerror = () => {
			this.maybeLoadNFT();
		};
		img.src = cache_url;
	}

	maybeLoadNFT() {
		if (this.summary.image) {
			return;
		}

		this.summary.loadNFT();
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
					this.mod.main.product_overlay.render(this.summary);
				}
			};
		}
	}
}

module.exports = Teaser;
