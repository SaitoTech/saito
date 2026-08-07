const TeaserTemplate = require('./teaser.template');
const Summary = require('../summary');
const { DREAMSCAPE_PLACEHOLDER } = require('../summary');
const { listingTeaserDataAttrs, listingTeaserSelector } = require('./summary-cache');

class Teaser {
  constructor(app, mod, summary = null, container = '') {
    this.app = app;
    this.mod = mod;
    this.summary = summary;
    this.container = container;
  }

  /** All mounted teaser instances for this listing (browse + storefront, etc.). */
  static returnTeaserCards(summary) {
    const selector = listingTeaserSelector(summary);
    if (!selector || typeof document === 'undefined') {
      return [];
    }
    return Array.from(document.querySelectorAll(selector));
  }

  static setMediaLoading(app, summary, loading = false) {
    for (const card of Teaser.returnTeaserCards(summary)) {
      const media = card.querySelector('.media');
      if (media) {
        media.classList.toggle('loading', loading);
      }
    }
  }

  static updateMedia(app, summary) {
    if (!(summary instanceof Summary) || !summary.nft_id) {
      return;
    }

    Teaser.applyMediaDisplay(app, summary, summary.returnMediaDisplay());
    Teaser.applyInfoDisplay(summary);
  }

  static applyInfoDisplay(summary) {
    if (!(summary instanceof Summary)) {
      return;
    }

    const cards = Teaser.returnTeaserCards(summary);
    if (!cards.length) {
      return;
    }

    summary.hydrateFromListingTransaction?.();

    const title = summary.returnTitle() || 'Untitled Item';
    const seller = summary.returnSeller?.() || summary.seller || '';
    const shortSeller =
      !seller || seller.length <= 18
        ? seller || 'anon'
        : `${seller.slice(0, 8)}…${seller.slice(-6)}`;
    const price = summary.returnPrice?.() || '';

    for (const card of cards) {
      const titleEl = card.querySelector('.info .title');
      if (titleEl) {
        titleEl.textContent = title;
      }

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
  }

  static applyMediaToElement(media, display = {}) {
    if (!media) {
      return;
    }

    media.classList.toggle('loading', !!display.loading);
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

  static applyMediaDisplay(app, summary, display = {}) {
    for (const card of Teaser.returnTeaserCards(summary)) {
      Teaser.applyMediaToElement(card.querySelector('.media'), display);
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
      TeaserTemplate(
        templateData,
        listingTeaserDataAttrs(this.summary),
        mediaClass,
        mediaBackground,
        showLoading
      ),
      this.container
    );

    if (!display.loading) {
      Teaser.applyMediaDisplay(this.app, this.summary, display);
    }

    this.attachEvents();
    this.beginMediaEnrichment();
  }

  beginMediaEnrichment() {
    if (!this.summary.isImageLoading() || this.summary._media_enriched) {
      return;
    }

    Teaser.setMediaLoading(this.app, this.summary, true);
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
    const root = this.container ? document.querySelector(this.container) : null;
    if (!root) {
      return;
    }

    const selector = listingTeaserSelector(this.summary);
    if (!selector) {
      return;
    }

    const cards = root.querySelectorAll(selector);
    const teaserCard = cards[cards.length - 1];
    if (!teaserCard) {
      return;
    }

    const open = (e) => {
      e.preventDefault();
      const detail = this.mod.main?.listing_detail || this.mod.main?.product_overlay;
      detail?.open?.(this.summary);
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
