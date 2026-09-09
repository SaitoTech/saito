const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const DelistOverlayTemplate = require('./delist-overlay.template');
const Summary = require('../../summary');
const { DREAMSCAPE_PLACEHOLDER } = require('../../summary');
const { loadTransactionFromArchive } = require('../../archive');
const { isStoreRentalListing } = require('../../categories');

function returnShortKey(key = '') {
  if (!key) {
    return 'anon-store';
  }
  if (key.length <= 18) {
    return key;
  }
  return `${key.slice(0, 8)}...${key.slice(-8)}`;
}

function loadListingSpend(app, mod, signature = '') {
  return new Promise((resolve, reject) => {
    const peerKey = mod.store_public_key;
    const sig = String(signature || '').trim();
    if (!sig) {
      reject(new Error('Listing signature required'));
      return;
    }
    if (!peerKey || !app?.network?.sendRequestAsTransaction) {
      reject(new Error('Store peer unavailable'));
      return;
    }

    app.network.sendRequestAsTransaction(
      'load-listing-spend',
      { module: 'Store', signature: sig },
      (response) => {
        if (!response?.signature || !response?.access_script) {
          reject(new Error('Listing spend data unavailable'));
          return;
        }
        resolve(response);
      },
      peerKey
    );
  });
}

class DelistOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.summary = null;
    this.busy = false;

    this.app.connection.on('store-delist-asset', (data) => {
      this.onStoreDelistAsset(data);
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

  hasCurrencyLabel(value = '') {
    return /[a-zA-Z]/.test(String(value));
  }

  returnCreatedDate(summary = {}) {
    const raw = summary.created_at || summary.createdAt || summary.timestamp || Date.now();
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return new Date().toLocaleDateString();
    }
    return date.toLocaleDateString();
  }

  returnProductType(summary = {}) {
    if (summary.type) {
      return summary.type;
    }
    if (summary.nft || summary.nft_id || summary.badge) {
      return 'NFT';
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
    const display = summary.returnMediaDisplay?.() || {};
    const listingImage =
      display.backgroundImage || (summary.hasLoadedImage?.() ? summary.returnImage?.() || '' : '');
    const placeholder =
      display.loading || display.innerHtml
        ? ''
        : summary.returnPlaceholderImage?.() || DREAMSCAPE_PLACEHOLDER;
    const rawImages = [listingImage || placeholder].filter(Boolean);
    const normalizedImages = rawImages
      .filter((src) => this.app?.browser?.isSafeMediaUrl?.(src))
      .map((src) => this.escapeHtml(src));
    if (!normalizedImages.length) {
      normalizedImages.push(this.escapeHtml(DREAMSCAPE_PLACEHOLDER));
    }

    const listingMeta = this.returnListingMeta(summary);
    const isRental = isStoreRentalListing(summary, listingMeta);
    const priceValue = summary.returnPrice?.() || summary.price || '';
    const currency = summary.currency || summary.denomination || 'SAITO';
    const primaryDisplay = this.escapeHtml(
      this.hasCurrencyLabel(priceValue) ? String(priceValue) : `${priceValue || 'N/A'} ${currency}`
    );
    const description = this.escapeHtml(summary.returnDescription?.() || '');
    const supply =
      Number(
        summary.quantity_total ?? summary.returnQuantity?.() ?? summary.quantity_available ?? 1
      ) || 1;

    return {
      identicon: this.escapeHtml(this.app?.keychain?.returnIdenticon?.(seller) || ''),
      listingTitle,
      seller: this.escapeHtml(returnShortKey(seller)),
      images: normalizedImages,
      primaryLabel: this.escapeHtml(isRental ? 'Rental Price' : 'Price'),
      primaryDisplay,
      supply,
      description,
      hasDescription: !!description,
      productType: this.escapeHtml(isRental ? 'store-nft-rental' : this.returnProductType(summary)),
      createdDate: this.escapeHtml(this.returnCreatedDate(summary)),
      imageLoading: summary.isImageLoading?.() ?? false
    };
  }

  open(summary) {
    if (!(summary instanceof Summary) || !summary.listing_signature) {
      return;
    }
    this.summary = summary;
    this.render(summary);

    const finish = () => {
      if (this.overlay?.visible && this.summary === summary) {
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

  render(summary = this.summary) {
    if (!(summary instanceof Summary)) {
      return;
    }
    this.summary = summary;
    this.overlay.show(DelistOverlayTemplate.viewTemplate(this.returnViewModel(summary)));
    this.attachEvents();
    this.applyProductMedia(summary);
  }

  applyProductMedia(summary = this.summary) {
    if (!(summary instanceof Summary)) {
      return;
    }

    const display = summary.returnMediaDisplay?.() || {};
    const media = document.querySelector('.listing-detail.delist .media');
    const mainImage = document.querySelector('.listing-detail.delist .image');
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

  attachEvents() {
    const root = document.querySelector('.listing-detail.delist');
    if (!root) {
      return;
    }

    const delistBtn = root.querySelector('[data-action="delist"]');
    if (!delistBtn) {
      return;
    }

    delistBtn.onclick = async (e) => {
      e.preventDefault();
      if (this.busy || delistBtn.disabled) {
        return;
      }
      this.busy = true;
      delistBtn.disabled = true;
      try {
        await this.submitDelist();
      } catch (err) {
        console.error('Store: delist failed', err);
        if (typeof siteMessage === 'function') {
          siteMessage(err?.message || 'Delist failed', 4000);
        }
        delistBtn.disabled = false;
        this.busy = false;
      }
    };
  }

  async submitDelist() {
    const summary = this.summary;
    if (!(summary instanceof Summary) || !summary.listing_signature) {
      throw new Error('Listing is unavailable');
    }

    const listing_row = await loadListingSpend(this.app, this.mod, summary.listing_signature);
    let listing_tx = summary.listing_tx || null;
    if (!listing_tx) {
      listing_tx = await loadTransactionFromArchive(this.app, summary.listing_signature);
    }

    const tx = await this.mod.createDelistAssetTransaction(listing_row, listing_tx);
    this.app.network.propagateTransaction(tx);

    const title = summary.returnTitle?.() || summary.title || 'Listing';
    this.overlay.close();
    this.watchDelist(tx, title, summary);
  }

  watchDelist(tx, listingTitle = '', summary = null) {
    if (!tx?.signature) {
      throw new Error('Delist requires a signed transaction');
    }
    if (!this.mod.transaction_monitor) {
      throw new Error('transaction_monitor is not initialized');
    }

    const lead = listingTitle
      ? `Delisting ${listingTitle} and returning the NFT to your wallet.`
      : 'Delisting this asset and returning the NFT to your wallet.';

    this.mod.transaction_monitor.render({
      tx,
      title: 'Delisting Asset',
      lead,
      subtitle: 'Waiting for confirmation...',
      auto_continue_on_confirm: true,
      callback: (result) => {
        this.busy = false;
        if (result?.status === 'confirmed') {
          this.onDelistConfirmed(summary);
        }
      }
    });
  }

  onStoreDelistAsset({ conf, tx } = {}) {
    if (Number(conf) !== 0 || !tx?.signature) {
      return;
    }
    // Monitor callback owns refresh when this client broadcast the delist.
  }

  onDelistConfirmed(summary = this.summary) {
    if (typeof siteMessage === 'function') {
      const title = summary?.returnTitle?.() || summary?.title || 'Listing';
      siteMessage(`Delisted: ${title}`, 4000);
    }

    const storefront = this.mod.main?.manager?.storefront;
    if (storefront?.isAdminActive?.()) {
      void storefront.loadAdminPage({ page: storefront.page || 1 });
    } else if (storefront?.reloadInventory) {
      void storefront.reloadInventory();
    }

    this.app.connection.emit('saito-nft-list-render-request');
    if (typeof this.app.wallet?.updateNFTList === 'function') {
      void this.app.wallet.updateNFTList();
    }
  }
}

module.exports = DelistOverlay;
