const TeaserTemplate = require('./teaser.template');
const Summary = require('../summary');
const { DREAMSCAPE_PLACEHOLDER } = require('../summary');
const { summaryDomId } = require('./summary-cache');

class Teaser {
	constructor(app, mod, summary = null, container = '') {
		this.app = app;
		this.mod = mod;
		this.summary = summary;
		this.container = container;
		this.cardId = summaryDomId(summary);
	}

	static returnTeaserCard(dom_id) {
		if (!dom_id) {
			return null;
		}
		return document.getElementById(dom_id);
	}

	static returnTeaserMedia(dom_id) {
		const card = Teaser.returnTeaserCard(dom_id);
		return card?.querySelector('.teaser-media') ?? null;
	}

	static setMediaLoading(app, dom_id, loading = false) {
		const media = Teaser.returnTeaserMedia(dom_id);
		if (!media) {
			return;
		}
		media.classList.toggle('teaser-media-loading', loading);
	}

	static updateMedia(app, summary) {
		if (!(summary instanceof Summary) || !summary.nft_id) {
			return;
		}

		if (!summary.hasLoadedImage?.()) {
			return;
		}

		const image = summary.returnImage();
		Teaser.updateMediaFromUrl(app, summaryDomId(summary), image);
	}

	static updateMediaFromUrl(app, dom_id, image_url = '') {
		if (!dom_id || !image_url) {
			return;
		}

		const media = Teaser.returnTeaserMedia(dom_id);
		if (!media) {
			return;
		}

		media.classList.remove(
			'dreamscape-placeholder',
			'gradient-1',
			'gradient-2',
			'gradient-3',
			'gradient-4',
			'gradient-5',
			'gradient-6',
			'gradient-7',
			'gradient-8',
			'gradient-9',
			'gradient-10',
			'teaser-media-loading'
		);
		media.classList.add('has-image');
		media.style.background = `url(${image_url}) center / cover no-repeat`;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container || !(this.summary instanceof Summary)) {
			return;
		}

		const image = this.summary.hasLoadedImage()
			? this.summary.returnImage()
			: this.summary.returnPlaceholderImage();
		const mediaClass = this.returnMediaClass(image);
		const mediaBackground = this.returnMediaBackground(image);
		const showLoading = this.summary.isImageLoading();
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
			TeaserTemplate(templateData, this.cardId, mediaClass, mediaBackground, badgeClass, showLoading),
			this.container
		);
		this.attachEvents();
		this.beginMediaEnrichment();
	}

	beginMediaEnrichment() {
		if (!this.summary.isImageLoading()) {
			return;
		}

		Teaser.setMediaLoading(this.app, this.cardId, true);
		this.summary.enrichMedia();
	}

	returnMediaClass(image = '') {
		if (this.summary.isDemo() && image?.startsWith?.('gradient-')) {
			return image;
		}
		if (!image) {
			return 'dreamscape-placeholder';
		}
		if (image.startsWith('gradient-')) {
			return image;
		}
		return 'has-image';
	}

	returnMediaBackground(image = '') {
		if (this.summary.isDemo() && image?.startsWith?.('gradient-')) {
			return this.returnGradientForClass(image);
		}
		if (!image || image.startsWith('gradient-')) {
			return `url(${DREAMSCAPE_PLACEHOLDER}) center / cover no-repeat`;
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
		const teaserCard = Teaser.returnTeaserCard(this.cardId);
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
