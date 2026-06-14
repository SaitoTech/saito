const TeaserTemplate = require('./teaser.template');

class Teaser {
	constructor(app, mod, data = {}, container = '') {
		this.app = app;
		this.mod = mod;
		this.data = data;
		this.container = container;
		this.cardId = `store-teaser-${this.data.id || Date.now()}`;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		const mediaClass = this.returnMediaClass(this.data.image);
		const mediaBackground = this.returnMediaBackground(this.data.image);
		const badgeClass = this.data.badge ? '' : 'hidden';
		const identicon = this.app.keychain.returnIdenticon(this.data.seller || this.data.id);
		const templateData = {
			title: this.data.title || '',
			subtitle: this.data.subtitle || '',
			seller: this.data.seller || '',
			identicon,
			show_buy_now: this.data.show_buy_now ?? this.data.can_buy ?? this.data.badge ?? false
		};

		this.app.browser.addElementToSelector(
			TeaserTemplate(templateData, this.cardId, mediaClass, mediaBackground, badgeClass),
			this.container
		);
		this.attachEvents();
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
				if (this.mod.product_overlay) {
					this.mod.product_overlay.render(this.data);
				}
			};
		}
	}
}

module.exports = Teaser;
