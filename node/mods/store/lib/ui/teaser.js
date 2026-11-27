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

  static formatListingPrice(value) {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return '';
    }
    const numeric = raw.replace(/SAITO/gi, '').replace(/,/g, '').trim();
    if (!numeric || !Number.isFinite(Number(numeric))) {
      return /[a-zA-Z]/.test(raw) ? raw : `${raw} SAITO`;
    }
    return `${Number(numeric).toLocaleString('en-US', { maximumFractionDigits: 8 })} SAITO`;
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
    const description = String(summary.returnDescription?.() || '').trim();
    const seller = summary.returnSeller?.() || summary.seller || '';
    const shortSeller =
      !seller || seller.length <= 18
        ? seller || 'anon'
        : `${seller.slice(0, 8)}…${seller.slice(-6)}`;
    const price = Teaser.formatListingPrice(summary.returnPrice?.() || '');

    for (const card of cards) {
      const titleEl = card.querySelector('.title');
      if (titleEl) {
        titleEl.textContent = title;
      }

      const descriptionEl = card.querySelector('.description');
      if (descriptionEl) {
        descriptionEl.textContent = description;
      }

      const sellerEl = card.querySelector('.seller');
      if (sellerEl) {
        sellerEl.textContent = shortSeller;
      }

      const priceEl = card.querySelector('.info .price');
      if (priceEl) {
        priceEl.textContent = price;
      }
    }
  }

  static applyMediaToElement(app, media, display = {}, placeholder = DREAMSCAPE_PLACEHOLDER) {
    if (!media) {
      return;
    }

    media.classList.toggle('loading', !!display.loading);
    if (display.loading) {
      return;
    }

    media.classList.remove('loading');
    media.querySelector('.loader')?.remove();
    media.classList.remove('placeholder', 'has-image', 'has-media-content');

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

    const bg = display.backgroundImage;
    if (bg && app?.browser?.isSafeMediaUrl?.(bg)) {
      media.classList.add('has-image');
      media.style.background = Teaser.mediaBackground(bg, 'contain');
      Teaser.confirmBackground(media, bg, placeholder);
      return;
    }

    if (!display.innerHtml) {
      media.classList.add('placeholder');
      media.style.background = Teaser.mediaBackground(placeholder, 'cover');
    } else {
      media.style.background = '';
    }
  }

  static confirmBackground(media, url, placeholder) {
    const expected = String(url || '');
    media.dataset.mediaUrl = expected;
    const probe = new Image();
    probe.onload = () => {
      if (media.dataset.mediaUrl === expected) {
        media.querySelector('.loader')?.remove();
      }
    };
    probe.onerror = () => {
      if (media.dataset.mediaUrl !== expected) {
        return;
      }
      media.classList.remove('has-image');
      media.classList.add('placeholder');
      media.style.background = Teaser.mediaBackground(placeholder, 'cover');
      media.querySelector('.loader')?.remove();
    };
    probe.src = expected;
  }

  static applyMediaDisplay(app, summary, display = {}) {
    const placeholder =
      typeof summary?.returnPlaceholderImage === 'function'
        ? summary.returnPlaceholderImage()
        : DREAMSCAPE_PLACEHOLDER;
    for (const card of Teaser.returnTeaserCards(summary)) {
      Teaser.applyMediaToElement(app, card.querySelector('.media'), display, placeholder);
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
    const price = Teaser.formatListingPrice(this.summary.returnPrice?.() || '');
    const templateData = {
      title: this.summary.returnTitle() || 'Untitled Item',
      description: String(this.summary.returnDescription?.() || '').trim(),
      price,
      seller: shortSeller,
      identicon,
      featured: this.summary.featured === true || this.summary.is_featured === true,
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

  static mediaBackground(url = '', fit = 'contain') {
    const safe = String(url || '').replace(/"/g, '%22');
    return `var(--saito-muted) url("${safe}") center / ${fit} no-repeat`;
  }

  returnMediaBackground(image = '', display = {}) {
    const fallback = this.summary.returnPlaceholderImage?.() || DREAMSCAPE_PLACEHOLDER;
    const raw = display.backgroundImage || image || fallback;
    const fit = display.backgroundImage || (image && image !== fallback) ? 'contain' : 'cover';
    if (!this.app.browser.isSafeMediaUrl(raw)) {
      return Teaser.mediaBackground(fallback, 'cover');
    }
    return Teaser.mediaBackground(raw, fit);
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
