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
    Teaser.applyInfoDisplay(summary);
  }

  static applyInfoDisplay(summary) {
    if (!(summary instanceof Summary)) {
      return;
    }

    const card = Teaser.returnTeaserCard(summaryDomId(summary));
    if (!card) {
      return;
    }

    summary.hydrateFromListingTransaction?.();

    const titleEl = card.querySelector('.info .title');
    if (titleEl) {
      titleEl.textContent = summary.returnTitle() || 'Untitled Item';
    }

    const seller = summary.returnSeller?.() || summary.seller || '';
    const shortSeller =
      !seller || seller.length <= 18
        ? seller || 'anon'
        : `${seller.slice(0, 8)}…${seller.slice(-6)}`;

    let sellerEl = card.querySelector('.info .seller');
    if (shortSeller) {
      if (!sellerEl) {
        sellerEl = document.createElement('p');
        sellerEl.className = 'seller';
        const titleNode = card.querySelector('.info .title');
        titleNode?.insertAdjacentElement('afterend', sellerEl);
      }
      sellerEl.textContent = shortSeller;
    }

    const price = summary.returnPrice?.() || '';
    let priceEl = card.querySelector('.info .price');
    if (price) {
      if (!priceEl) {
        priceEl = document.createElement('p');
        priceEl.className = 'price';
        card.querySelector('.info')?.appendChild(priceEl);
      }
      priceEl.textContent = price;
    }
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

    media.classList.remove('placeholder', 'has-image', 'loading', 'has-media-content');

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
    const seller = this.summary.returnSeller?.() || this.summary.seller || '';
    const identicon = this.app.keychain.returnIdenticon(seller);
    const shortSeller =
      !seller || seller.length <= 18
        ? seller || 'anon'
        : `${seller.slice(0, 8)}…${seller.slice(-6)}`;
    const price = this.summary.returnPrice?.() || '';
    const templateData = {
      title: this.summary.returnTitle() || 'Untitled Item',
      price,
      seller: shortSeller,
      identicon,
      show_buy_now: this.summary.show_buy_now ?? this.summary.can_buy ?? this.summary.badge ?? false
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
    if (display.backgroundImage || display.innerHtml) {
      return display.backgroundImage ? 'has-image' : 'has-media-content';
    }
    if (!image) {
      return 'placeholder';
    }
    return 'has-image';
  }

  returnMediaBackground(image = '', display = {}) {
    if (display.backgroundImage) {
      return `url(${display.backgroundImage}) center / cover no-repeat`;
    }
    if (!image) {
      return `url(${DREAMSCAPE_PLACEHOLDER}) center / cover no-repeat`;
    }
    return `url(${image}) center / cover no-repeat`;
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
