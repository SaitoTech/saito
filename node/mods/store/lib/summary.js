const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const {
  DREAMSCAPE_PLACEHOLDER,
  ensureListingTransaction,
  enrichSummaryMedia
} = require('./summary-media');
const { STORE_CATEGORIES } = require('./categories');

const SUMMARY_STATUS_ACTIVE = 1;
const SUMMARY_STATUS_INACTIVE = 0;

class Summary {
  constructor(app, mod, data = {}) {
    this.app = app;
    this.mod = mod;

    this.id = data.id ?? 0;
    this.nft_id = data.nft_id || '';
    this.seller = data.seller || '';
    this.category = data.category || STORE_CATEGORIES.OTHER;
    this.title = data.title || '';
    this.description = data.description || '';
    this.image = data.image ?? null;
    this.price = data.price ?? 0;
    this.quantity_available = data.quantity_available ?? data.quantity ?? 0;
    this.quantity_total = data.quantity_total ?? Number(this.quantity_available);
    this.status = data.status ?? SUMMARY_STATUS_ACTIVE;
    this.created_at = Number(data.created_at || 0);
    this.updated_at = data.updated_at || 0;
    this.subtitle = data.subtitle || '';
    this.badge = data.badge;
    this.nft = data.nft || null;
    this.listing_signature = data.listing_signature || '';
    this.listing_tx = data.listing_tx || null;
    this._image_source = data._image_source || null;
    this._media_enriched = data._media_enriched || false;
    this.note = data.note || '';
    this.buyer = data.buyer || '';
    this.seller_note = data.seller_note || '';
    this.quantity_sold = Number(data.quantity_sold ?? 0) || 0;
    this.sold_at = Number(data.sold_at || 0) || 0;
  }

  returnPlaceholderImage() {
    return DREAMSCAPE_PLACEHOLDER;
  }

  isImageLoading() {
    return this.returnMediaDisplay().loading;
  }

  hasLoadedImage() {
    return !!this.image;
  }

  returnMediaDisplay() {
    if (this.nft?.returnMediaDisplay) {
      const display = this.nft.returnMediaDisplay();
      if (!display.loading || !this._media_enriched) {
        return display;
      }
    }

    if (this.image) {
      return {
        backgroundImage: this.image,
        innerHtml: '',
        loading: false,
        failed: false
      };
    }

    if (this._media_enriched) {
      return {
        backgroundImage: this.returnPlaceholderImage(),
        innerHtml: '',
        loading: false,
        failed: false
      };
    }

    return {
      backgroundImage: '',
      innerHtml: '',
      loading: true,
      failed: false
    };
  }

  returnImage() {
    if (this.image) {
      return this.image;
    }
    const nft_image = this.nft?.returnImage?.() || '';
    if (nft_image) {
      return nft_image;
    }
    return this.returnPlaceholderImage();
  }

  returnCacheImageUrl() {
    const nft_id = String(this.nft_id ?? '');
    if (!nft_id) {
      return '';
    }
    const slug = this.mod?.returnSlug?.() || 'store';
    return `/${encodeURI(slug)}/cache/${encodeURIComponent(nft_id)}.img`;
  }

  returnTitle() {
    this.hydrateFromListingTransaction();
    const title = String(this.title || this.nft?.title || '').trim();
    return title || 'Untitled Item';
  }

  returnDescription() {
    this.hydrateFromListingTransaction();
    return this.description ?? this.nft?.description ?? '';
  }

  returnSeller() {
    this.hydrateFromListingTransaction();
    return String(this.seller || '').trim();
  }

  returnQuantity() {
    return Number(this.quantity_available ?? 0) || 0;
  }

  returnPrice() {
    this.hydrateFromListingTransaction();
    try {
      const nolan = BigInt(this.price ?? 0);
      if (nolan > 0n && this.app?.wallet?.convertNolanToSaito) {
        return `${this.app.wallet.convertNolanToSaito(nolan)} SAITO`;
      }
      if (nolan > 0n) {
        return String(nolan);
      }
    } catch (err) {
      // Non-integral / unexpected price values should not blank the card.
    }
    const raw = this.price;
    if (raw != null && raw !== '' && Number(raw) !== 0) {
      return String(raw);
    }
    return '';
  }

  /**
   * Pull display fields from an already-attached listing tx when Summary
   * surface fields are empty (same source listing detail uses after open).
   */
  hydrateFromListingTransaction() {
    if (!this.listing_tx) {
      return this;
    }
    const hasTitle = !!String(this.title || '').trim();
    const hasSeller = !!String(this.seller || '').trim();
    const hasPrice = Number(this.price) > 0;
    if (hasTitle && hasSeller && hasPrice && this.nft) {
      return this;
    }
    const { applyListingTransaction } = require('./summary-media');
    applyListingTransaction(this, this.listing_tx);
    return this;
  }

  isActive() {
    return Number(this.quantity_available ?? 0) > 0;
  }

  attachNFT(nft) {
    if (!nft) {
      return this;
    }
    this.nft = nft;
    if (!this.image) {
      const image = nft.returnImage?.() || '';
      if (image) {
        this.image = image;
      }
    }
    return this;
  }

  ensureListingTransaction(onComplete = null) {
    const done = (summary) => {
      if (onComplete) {
        onComplete(summary);
      }
      return summary;
    };

    return ensureListingTransaction(this).then(done);
  }

  enrichMedia(onComplete = null) {
    const done = (summary) => {
      if (onComplete) {
        onComplete(summary);
      }
      return summary;
    };

    return enrichSummaryMedia(this).then(done);
  }

  serialize() {
    return {
      nft_id: this.nft_id,
      seller: this.seller,
      category: this.category || STORE_CATEGORIES.OTHER,
      title: this.title,
      description: this.description,
      listing_signature: this.listing_signature || '',
      price: this.price,
      quantity_total: this.quantity_total,
      quantity_available: this.quantity_available,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at,
      subtitle: this.subtitle,
      badge: this.badge,
      note: this.note || '',
      buyer: this.buyer || '',
      quantity_sold: this.quantity_sold || 0,
      sold_at: this.sold_at || 0
    };
  }
}

module.exports = Summary;
module.exports.SUMMARY_STATUS_ACTIVE = SUMMARY_STATUS_ACTIVE;
module.exports.SUMMARY_STATUS_INACTIVE = SUMMARY_STATUS_INACTIVE;
module.exports.DREAMSCAPE_PLACEHOLDER = DREAMSCAPE_PLACEHOLDER;
