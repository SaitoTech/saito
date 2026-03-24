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
		const badgeClass = this.data.badge ? '' : 'hidden';
		const templateData = {
			title: this.data.title || '',
			subtitle: this.data.subtitle || '',
			seller: this.data.seller || ''
		};

		this.app.browser.addElementToSelector(
			TeaserTemplate(templateData, this.cardId, mediaClass, badgeClass),
			this.container
		);

		this.applyMediaImage();
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

	applyMediaImage() {
		if (!this.data.image || this.data.image.startsWith('gradient-')) {
			return;
		}

		const media = document.querySelector(`#${this.cardId} .teaser-media`);
		if (media) {
			media.style.backgroundImage = `url(${this.data.image})`;
		}
	}

	attachEvents() {
		const buyButton = document.querySelector(`#${this.cardId} .buy-btn`);
		if (buyButton) {
			buyButton.onclick = (e) => {
				e.preventDefault();
				console.log(this.data);
			};
		}
	}
}

module.exports = Teaser;
