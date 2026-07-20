const TeaserTemplate = require('./teaser.template');
const Summary = require('../summary');
const { DREAMSCAPE_PLACEHOLDER } = require('../summary');
const { summaryDomId } = require('./summary-cache');

const GRADIENT_CLASSES = [
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
];

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
		return card?.querySelector('.media') ?? null;
	}

	static setMediaLoading(app, dom_id, loading = false) {
		const media = Teaser.returnTeaserMedia(dom_id);
		if (!media) {
			return;
		}
		media.classList.toggle('loading', loading);
	}

	static updateMedia(app, summary) {
		if (!(summary instanceof Summary) || !summary.nft_id) {
			return;
		}

		Teaser.applyMediaDisplay(app, summaryDomId(summary), summary.returnMediaDisplay());
	}

	static applyMediaDisplay(app, dom_id, display = {}) {
		const media = Teaser.returnTeaserMedia(dom_id);
		if (!media) {
			return;
		}

		Teaser.setMediaLoading(app, dom_id, !!display.loading);
		if (display.loading) {
			return;
		}

		media.classList.remove('placeholder', 'has-image', 'loading', 'has-media-content', ...GRADIENT_CLASSES);

		let content = media.querySelector('.media-content');
		if (display.innerHtml) {
			if (!content) {
				content = document.createElement('div');
				content.className = 'media-content';
				media.insertBefore(content, media.firstChild);
			}
			content.innerHTML = display.innerHtml;
		} else if (content) {
			content.remove();
		}

		if (display.backgroundImage) {
			media.classList.add('has-image');
			media.style.background = `url(${display.backgroundImage}) center / cover no-repeat`;
			return;
		}

		if (!display.innerHtml) {
			media.classList.add('placeholder');
			media.style.background = `url(${DREAMSCAPE_PLACEHOLDER}) center / cover no-repeat`;
		} else {
			media.style.background = '';
		}
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container || !(this.summary instanceof Summary)) {
			return;
		}

		const display = this.summary.returnMediaDisplay();
		const image = this.summary.hasLoadedImage()
			? this.summary.returnImage()
			: this.summary.returnPlaceholderImage();
		const mediaClass = this.returnMediaClass(image, display);
		const mediaBackground = this.returnMediaBackground(image, display);
		const showLoading = !!display.loading;
		const identicon = this.app.keychain.returnIdenticon(this.summary.seller || '');
		const seller = this.summary.seller || '';
		const shortSeller =
			!seller || seller.length <= 18
				? seller || 'anon'
				: `${seller.slice(0, 8)}…${seller.slice(-6)}`;
		const templateData = {
			title: this.summary.returnTitle(),
			subtitle: this.summary.subtitle || '',
			seller: shortSeller,
			identicon,
			show_buy_now:
				this.summary.show_buy_now ??
				this.summary.can_buy ??
				this.summary.badge ??
				false
		};

		this.app.browser.addElementToSelector(
			TeaserTemplate(templateData, this.cardId, mediaClass, mediaBackground, showLoading),
			this.container
		);

		if (!display.loading) {
			Teaser.applyMediaDisplay(this.app, this.cardId, display);
		}

		this.attachEvents();
		this.beginMediaEnrichment();
	}

	beginMediaEnrichment() {
		if (!this.summary.isImageLoading() || this.summary._media_enriched) {
			return;
		}

		Teaser.setMediaLoading(this.app, this.cardId, true);
		this.summary.enrichMedia(() => {
			Teaser.updateMedia(this.app, this.summary);
		});
	}

	returnMediaClass(image = '', display = {}) {
		if (this.summary.isDemo() && image?.startsWith?.('gradient-')) {
			return image;
		}
		if (display.backgroundImage || display.innerHtml) {
			return display.backgroundImage ? 'has-image' : 'has-media-content';
		}
		if (!image) {
			return 'placeholder';
		}
		if (image.startsWith('gradient-')) {
			return image;
		}
		return 'has-image';
	}

	returnMediaBackground(image = '', display = {}) {
		if (display.backgroundImage) {
			return `url(${display.backgroundImage}) center / cover no-repeat`;
		}
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
		if (!teaserCard) {
			return;
		}

		const open = (e) => {
			e.preventDefault();
			const detail = this.mod.main?.listing_detail || this.mod.main?.product_overlay;
			if (detail) {
				detail.render(this.summary);
			}
		};

		teaserCard.onclick = open;
		teaserCard.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				open(e);
			}
		};
	}
}

module.exports = Teaser;
