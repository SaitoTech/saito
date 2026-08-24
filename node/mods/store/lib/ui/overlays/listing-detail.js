const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ListingDetailTemplate = require('./listing-detail.template');
const ListingFieldEdit = require('./listing-field-edit');
const Summary = require('../../summary');
const { DREAMSCAPE_PLACEHOLDER } = require('../../summary');
const { summaryBucketKey } = require('../summary-cache');
const { isStoreRentalListing } = require('../../categories');
const { durationLabel, rightsLabel } = require('./rental-listing.template');
const { yieldForPaint } = require('../purchase-service');

function returnShortKey(key = '') {
  if (!key) {
    return 'anon-store';
  }
  if (key.length <= 18) {
    return key;
  }
  return `${key.slice(0, 8)}...${key.slice(-8)}`;
}

class ListingDetailOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.field_edit = new ListingFieldEdit(app, mod);
    this.mode = 'view';
    this.summary = null;
    this.selectedNft = null;
    this.defaults = {};
    this.onBack = null;
    this.listing = {
      title: '',
      description: '',
      price: '1',
      quantity_total: 1,
      quantity_available: 1
    };
    this.max_quantity_total = 1;

    this.app.connection.on('store-listing-updated', (summary) => {
      if (
        this.overlay?.visible &&
        this.mode === 'view' &&
        this.summary?.nft_id &&
        summaryBucketKey(this.summary.nft_id, this.summary.price) ===
          summaryBucketKey(summary.nft_id, summary.price)
      ) {
        // Paint only — do not restart archive/media loading.
        this.render(summary);
      }
    });
  }

  escapeHtml(value = '') {
    if (this.app?.browser?.escapeHTML) {
      return this.app.browser.escapeHTML(String(value));
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  returnFallbackImage() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132736'/%3E%3Cstop offset='1' stop-color='%233c8fcb'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23g)'/%3E%3C/svg%3E";
  }

  returnMediaHtml(nft) {
    if (!nft) {
      return ListingDetailTemplate.mediaImage(this.returnFallbackImage());
    }

    if (nft.image) {
      if (this.app?.browser?.isSafeMediaUrl?.(nft.image)) {
        return ListingDetailTemplate.mediaImage(this.escapeHtml(nft.image));
      }
      return ListingDetailTemplate.mediaImage(this.returnFallbackImage());
    }

    const textContent =
      nft.text || nft.json || nft.js || nft.css || nft.description || 'NFT content';
    return ListingDetailTemplate.mediaText(this.escapeHtml(textContent));
  }

  returnFileTypeFromImages(images = []) {
    const sample = images[0] || '';
    if (!sample) {
      return 'unknown';
    }
    if (sample.startsWith('data:image/')) {
      return 'image';
    }
    const ext = sample.split('?')[0].split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) {
      return `image/${ext}`;
    }
    return ext || 'unknown';
  }

  returnFileTypeFromNft(nft) {
    const type = nft?.returnType?.() || nft?.nft_type || 'unknown';
    if (type === 'image') {
      return 'image';
    }
    return type;
  }

  returnCreatedDate(summary = {}) {
    const raw = summary.created_at || summary.createdAt || summary.timestamp || Date.now();
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return new Date().toLocaleDateString();
    }
    return date.toLocaleDateString();
  }

  hasCurrencyLabel(value = '') {
    return /[a-zA-Z]/.test(String(value));
  }

  returnProductType(summary = {}) {
    if (summary.type) {
      return summary.type;
    }
    if (summary.nft || summary.nft_id || summary.badge) {
      return 'NFT';
    }
    if (summary.delivery || summary.shipping || summary.physical) {
      return 'Physical';
    }
    return 'Digital';
  }

  returnListingMeta(summary = {}) {
    const tx = summary.listing_tx;
    const txmsg = tx?.returnMessage?.() || tx?.msg || {};
    return txmsg.listing || {};
  }

  returnViewModel(summary = {}) {
    const listingTitle = this.escapeHtml(summary.returnTitle?.() || 'Untitled Item');
    const seller = summary.seller || 'anon-store';
    const shortSeller = returnShortKey(seller);

    const display = summary.returnMediaDisplay?.() || {};
    const listingImage =
      display.backgroundImage || (summary.hasLoadedImage?.() ? summary.returnImage?.() || '' : '');
    const placeholder =
      display.loading || display.innerHtml
        ? ''
        : summary.returnPlaceholderImage?.() || DREAMSCAPE_PLACEHOLDER;
    const rawImages = Array.isArray(summary.images)
      ? summary.images.filter(Boolean)
      : [listingImage || placeholder];
    const normalizedImages = rawImages
      .filter((src) => this.app?.browser?.isSafeMediaUrl?.(src))
      .map((src) => this.escapeHtml(src));
    if (!normalizedImages.length) {
      normalizedImages.push(this.escapeHtml(DREAMSCAPE_PLACEHOLDER));
    }

    const listingMeta = this.returnListingMeta(summary);
    const isRental = isStoreRentalListing(summary, listingMeta);

    const priceValue = summary.returnPrice?.() || summary.price || summary.reserve_price || '';
    const bidValue = summary.current_bid || summary.currentBid || '';
    const isBid = !!bidValue && !priceValue && !isRental;
    const primaryValue = isBid ? bidValue : priceValue || 'N/A';
    const primaryLabel = isRental ? 'Rental Price' : isBid ? 'Current Bid' : 'Price';
    const currency = summary.currency || summary.denomination || 'SAITO';
    const nextBid = summary.next_bid || summary.nextMinBid || '';
    const supply = summary.returnQuantity?.() || 1;
    const actionText = isRental ? 'Rent' : isBid ? 'Bid' : 'Buy';
    const description = this.escapeHtml(summary.returnDescription?.() || '');
    const txid = String(summary.listing_signature || summary.nft_id || 'N/A');
    const primaryDisplay = this.escapeHtml(
      this.hasCurrencyLabel(primaryValue) ? String(primaryValue) : `${primaryValue} ${currency}`
    );
    const nextBidDisplay = this.escapeHtml(
      this.hasCurrencyLabel(nextBid) ? String(nextBid) : `${nextBid} ${currency}`
    );

    const durationHours = listingMeta.rental_duration_hours || summary.nft?.data?.duration_hours;
    const rights = listingMeta.rental_rights || summary.nft?.data?.rights || 'all';

    return {
      identicon: this.escapeHtml(this.app?.keychain?.returnIdenticon?.(seller) || ''),
      listingTitle,
      seller: this.escapeHtml(seller),
      shortSeller: this.escapeHtml(shortSeller),
      images: normalizedImages,
      hasGallery: normalizedImages.length > 1,
      primaryLabel: this.escapeHtml(primaryLabel),
      primaryDisplay,
      nextBid,
      showNextBid: !!nextBid && !isRental,
      nextBidDisplay,
      supply,
      showQuantity: !isRental && supply > 1,
      actionText: this.escapeHtml(actionText),
      description,
      hasDescription: !!description,
      productType: this.escapeHtml(isRental ? 'store-nft-rental' : this.returnProductType(summary)),
      fileType: this.escapeHtml(this.returnFileTypeFromImages(rawImages)),
      createdDate: this.escapeHtml(this.returnCreatedDate(summary)),
      txidShort: this.escapeHtml(returnShortKey(txid)),
      imageLoading: summary.isImageLoading?.() ?? false,
      isRental,
      rentalDuration: this.escapeHtml(durationHours ? durationLabel(durationHours) : ''),
      rentalRights: this.escapeHtml(rightsLabel(rights))
    };
  }

  returnEditView(nft) {
    const seller = this.mod.publicKey || 'anon-store';
    const priceNum = Number(this.listing.price) || 1;
    const creator =
      (typeof nft?.returnCreator === 'function' ? nft.returnCreator() : null) ||
      nft?.creator ||
      nft?.slip1?.publicKey ||
      nft?.slip1?.public_key ||
      '';
    const nftId = nft?.id || nft?.uuid || '';
    const nftIdenticon = this.app?.keychain?.returnIdenticon?.(nftId || creator || seller) || '';

    return {
      listingTitle: this.escapeHtml(this.listing.title),
      seller: this.escapeHtml(seller),
      creatorDisplay: this.escapeHtml(creator || 'Unknown creator'),
      nftIdenticon,
      mediaHtml: this.returnMediaHtml(nft),
      description: this.escapeHtml(this.listing.description),
      priceDisplay: `${priceNum} SAITO`,
      productType: this.escapeHtml(nft?.returnType?.() || 'NFT'),
      fileType: this.escapeHtml(this.returnFileTypeFromNft(nft)),
      createdDate: new Date().toLocaleDateString(),
      supply: this.listing.quantity_total
    };
  }

  resetListingFromNft(nft) {
    const max_quantity_total = Number(nft?.getTotalAmount?.() || nft?.amount || 1) || 1;
    this.max_quantity_total = max_quantity_total;
    this.listing = {
      title: nft?.title || 'Untitled NFT',
      description: nft?.description || '',
      price: '1',
      quantity_total: max_quantity_total,
      quantity_available: max_quantity_total
    };
  }

  applyProductMedia(summary = this.summary) {
    if (!(summary instanceof Summary)) {
      return;
    }

    const display = summary.returnMediaDisplay?.() || {};
    const media = document.querySelector('.listing-detail .media');
    const mainImage = document.querySelector('.listing-detail .image');
    if (!media) {
      return;
    }

    let content = media.querySelector('.media-content');
    if (display.loading) {
      return;
    }

    if (display.innerHtml) {
      if (mainImage) {
        mainImage.style.display = 'none';
      }
      if (!content) {
        content = document.createElement('div');
        content.className = 'media-content';
        media.appendChild(content);
      }
      content.innerHTML = display.innerHtml;
      return;
    }

    if (content) {
      content.remove();
    }
    if (mainImage) {
      mainImage.style.display = '';
      if (display.backgroundImage && this.app?.browser?.isSafeMediaUrl?.(display.backgroundImage)) {
        mainImage.setAttribute('src', display.backgroundImage);
      }
    }
  }

  /**
   * Open a listing for viewing: paint immediately, then load anything missing.
   * Callers that only need a repaint (media updates, etc.) should use render().
   */
  open(summary) {
    this.render(summary);
    if (!(summary instanceof Summary)) {
      return;
    }

    const finish = () => {
      if (this.overlay?.visible && this.mode === 'view' && this.summary === summary) {
        this.render(summary);
      }
    };

    if (!summary.listing_tx && summary.listing_signature) {
      summary.ensureListingTransaction(() => {
        if (summary.isImageLoading?.()) {
          summary.enrichMedia(finish);
          return;
        }
        finish();
      });
      return;
    }

    if (summary.isImageLoading?.()) {
      summary.enrichMedia(finish);
    }
  }

  /**
   * Paint the overlay from current state. Does not load or enrich data.
   * View: render(summary) | Edit: render({ mode: 'edit', nft, defaults })
   */
  render(input = null) {
    if (input && !(input instanceof Summary) && input.mode === 'edit') {
      this.renderEdit(input.nft, input.defaults || {});
      return;
    }

    this.mode = 'view';
    if (input) {
      this.summary = input;
    }
    const view = this.returnViewModel(this.summary || {});
    this.overlay.show(ListingDetailTemplate.viewTemplate(view));
    this.attachViewEvents();
    this.applyProductMedia();
  }

  renderEdit(nft, defaults = {}) {
    this.mode = 'edit';
    this.defaults = defaults;
    this.selectedNft = nft?.nft || nft;
    this.resetListingFromNft(this.selectedNft);

    const view = this.returnEditView(this.selectedNft);
    this.overlay.show(ListingDetailTemplate.editTemplate(view), () => {
      if (typeof this.defaults?.callback === 'function') {
        this.defaults.callback({ status: 'cancelled' });
      }
    });
    this.attachEditEvents();
    this.applyEditDefaults();
  }

  attachViewEvents() {
    const root = document.querySelector('.listing-detail');
    if (!root) {
      return;
    }

    const mainImage = root.querySelector('.image');
    root.querySelectorAll('.thumb').forEach((thumb) => {
      thumb.onclick = (e) => {
        e.preventDefault();
        const src = thumb.getAttribute('data-src');
        if (mainImage && src) {
          mainImage.setAttribute('src', src);
        }
        root.querySelectorAll('.thumb').forEach((n) => {
          n.classList.remove('active');
          n.setAttribute('aria-pressed', 'false');
        });
        thumb.classList.add('active');
        thumb.setAttribute('aria-pressed', 'true');
      };
    });

    if (mainImage) {
      mainImage.onerror = () => {
        const summary = this.summary;
        const display = summary?.returnMediaDisplay?.() || {};
        if (display.innerHtml || display.loading) {
          return;
        }
        mainImage.onerror = null;
        if (!(summary instanceof Summary)) {
          return;
        }
        summary.enrichMedia(() => {
          if (this.overlay?.visible && this.mode === 'view' && this.summary === summary) {
            this.render(summary);
          }
        });
      };
    }

    const buyBtn = root.querySelector('[data-action="buy"]');
    if (buyBtn) {
      buyBtn.onclick = async (e) => {
        e.preventDefault();
        const summary = this.summary;
        if (!(summary instanceof Summary)) {
          return;
        }

        const listingMeta = this.returnListingMeta(summary);
        const isRental = isStoreRentalListing(summary, listingMeta);
        const qtyInput = root.querySelector('#listing-qty');
        const quantity = isRental ? 1 : qtyInput ? Number(qtyInput.value) || 1 : 1;

        if (buyBtn.disabled) {
          return;
        }
        buyBtn.disabled = true;

        try {
          await this.mod.main?.purchase_flow?.startPurchase(summary, quantity);
        } finally {
          buyBtn.disabled = false;
        }
      };
    }
  }

  attachEditEvents() {
    const root = document.querySelector('.listing-detail.edit');
    if (!root) {
      return;
    }

    const openFieldEdit = (field) => {
      if (this.defaults?.locked?.includes(field.lockKey || field.name)) {
        return;
      }

      this.field_edit.render({
        title: field.title,
        value: field.value,
        multiline: !!field.multiline,
        inputType: field.inputType || 'text',
        placeholder: field.placeholder || '',
        onSave: (raw) => {
          const result = field.parse(raw);
          if (result === false) {
            return false;
          }
          field.apply(result);
          return true;
        }
      });
    };

    root.querySelector('[data-edit="title"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      openFieldEdit({
        name: 'title',
        title: 'Edit Title',
        value: this.listing.title,
        placeholder: 'Listing title',
        parse: (raw) => {
          const next = String(raw || '').trim();
          return next || false;
        },
        apply: (next) => {
          this.listing.title = next;
          root.querySelector('[data-field="title"]').textContent = next;
        }
      });
    });

    root.querySelector('[data-edit="description"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      openFieldEdit({
        name: 'description',
        lockKey: 'description',
        title: 'Edit Description',
        value: this.listing.description,
        multiline: true,
        placeholder: 'Describe this listing',
        parse: (raw) => String(raw ?? '').trim(),
        apply: (next) => {
          this.listing.description = next;
          root.querySelector('[data-field="description"]').textContent =
            next || 'No description provided.';
        }
      });
    });

    root.querySelector('[data-edit="price"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      openFieldEdit({
        name: 'price',
        lockKey: 'price',
        title: 'Edit Price',
        value: String(this.listing.price),
        inputType: 'text',
        placeholder: 'Price in SAITO',
        parse: (raw) => {
          const cleaned = String(raw || '')
            .trim()
            .replace(/[^\d.]/g, '');
          return cleaned || false;
        },
        apply: (cleaned) => {
          this.listing.price = cleaned;
          root.querySelector('[data-field="price"]').textContent = `${cleaned} SAITO`;
        }
      });
    });

    root.querySelector('[data-edit="available"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      openFieldEdit({
        name: 'available',
        lockKey: 'quantity',
        title: 'Edit Available Quantity',
        value: String(this.listing.quantity_total),
        inputType: 'number',
        placeholder: `1–${this.max_quantity_total}`,
        parse: (raw) => {
          let qty = parseInt(String(raw || '').trim(), 10);
          if (!Number.isFinite(qty) || qty < 1) {
            return false;
          }
          if (qty > this.max_quantity_total) {
            qty = this.max_quantity_total;
          }
          return qty;
        },
        apply: (qty) => {
          this.listing.quantity_total = qty;
          this.listing.quantity_available = qty;
          root.querySelector('[data-field="available"]').textContent = String(qty);
        }
      });
    });

    const submitBtn = root.querySelector('[data-action="submit"]');
    if (submitBtn) {
      submitBtn.onclick = async (e) => {
        e.preventDefault();
        await this.submitListing();
      };
    }
  }

  applyEditDefaults() {
    const root = document.querySelector('.listing-detail.edit');
    if (!root) {
      return;
    }

    if (this.defaults?.price) {
      this.listing.price = String(this.defaults.price);
      const priceEl = root.querySelector('[data-field="price"]');
      if (priceEl) {
        priceEl.textContent = `${this.listing.price} SAITO`;
      }
      if (this.defaults.locked?.includes('price')) {
        const affordance = root.querySelector('[data-edit="price"]');
        if (affordance) {
          affordance.hidden = true;
        }
      }
    }

    if (this.defaults?.quantity) {
      let qty = parseInt(this.defaults.quantity, 10);
      if (!Number.isFinite(qty) || qty < 1) {
        qty = 1;
      }
      if (qty > this.max_quantity_total) {
        qty = this.max_quantity_total;
      }
      this.listing.quantity_total = qty;
      this.listing.quantity_available = qty;
      const qtyEl = root.querySelector('[data-field="available"]');
      if (qtyEl) {
        qtyEl.textContent = String(qty);
      }
      if (this.defaults.locked?.includes('quantity')) {
        const affordance = root.querySelector('[data-edit="available"]');
        if (affordance) {
          affordance.hidden = true;
        }
      }
    }

    if (this.defaults?.description) {
      this.listing.description = String(this.defaults.description);
      const descEl = root.querySelector('[data-field="description"]');
      if (descEl) {
        descEl.textContent = this.listing.description || 'No description provided';
      }
      if (this.defaults.locked?.includes('description')) {
        const affordance = root.querySelector('[data-edit="description"]');
        if (affordance) {
          affordance.hidden = true;
        }
      }
    }
  }

  async submitListing() {
    const submitBtn = document.querySelector(
      '.listing-detail.edit:not(.rental-ready) [data-action="submit"]'
    );
    if (submitBtn?.disabled) {
      return;
    }

    const restore = () => {
      if (!submitBtn) {
        return;
      }
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.textContent = 'Submit Listing';
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      submitBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Preparing listing…';
    }
    await yieldForPaint();

    try {
      const tx = await this.mod.createListAssetTransaction(this.selectedNft, this.listing);
      await this.app.network.propagateTransaction(tx);

      if (typeof this.defaults?.callback === 'function') {
        this.defaults.callback({
          status: 'listed',
          tx: tx
        });
        this.defaults.callback = null;
      }

      this.beginListingProgress(tx);
    } catch (err) {
      console.error('Store: listing failed', err);
      restore();
      alert(err?.message || 'Listing failed');
    }
  }

  beginListingProgress(tx) {
    if (!this.mod.listing_lifecycle) {
      const ListingLifecycle = require('../listing-lifecycle');
      this.mod.listing_lifecycle = new ListingLifecycle(this.app, this.mod);
    }

    const entry = this.mod.listing_lifecycle.begin({
      nft: this.selectedNft,
      listing: this.listing,
      listingTx: tx,
      sellerPublicKey: this.mod.publicKey
    });

    // Close create-listing UI without treating it as cancel.
    this.overlay.close();

    const title = entry?.title || this.listing?.title || '';
    const safeTitle = String(title)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const lead = safeTitle
      ? `Your listing for <strong>${safeTitle}</strong> has been broadcast to the Saito network.`
      : 'Your listing has been broadcast to the Saito network.';

    // Progress overlay first so the user never sees a silent close.
    this.mod.transaction_monitor.render({
      tx,
      title: 'Listing Submitted',
      lead,
      successTitle: 'Listing Successful',
      successLead: 'You have successfully added an item to your Saito Store.',
      callback: (result) => {
        if (result?.status === 'cancelled') {
          const active = this.mod.listing_lifecycle?.returnActiveListing?.();
          if (active) {
            this.mod.listing_lifecycle.dismiss(active.id);
          }
        }
      }
    });

    // Switch Store underneath to the seller admin page (when the Store page is active).
    if (this.mod.main?.openStorefront && this.mod.publicKey) {
      Promise.resolve(
        this.mod.main.openStorefront(this.mod.publicKey, {
          celebrate: true,
          admin: true
        })
      ).catch((err) => {
        console.warn('Store: openStorefront after list failed', err?.message || err);
      });
    }
  }
}

module.exports = ListingDetailOverlay;
