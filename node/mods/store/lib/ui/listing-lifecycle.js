const PHASE = {
  CONFIRMING: 'confirming',
  COMPLETE: 'complete',
  DISMISSED: 'dismissed'
};

/**
 * Progress tracking for an in-flight listing broadcast.
 * Does not fabricate or inject listing teaser / Summary objects —
 * warehouse inventory is the source of truth after confirmation.
 */
class ListingLifecycle {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.listings = [];

    this.app.connection.on('store-list-asset', (data) => {
      this.onStoreListAsset(data);
    });
    this.app.connection.on('store-new-block', () => {
      this.emitActive();
    });
  }

  /**
   * Begin tracking a listing after the tx is broadcast (progress UI only).
   */
  begin({ nft = null, listing = {}, listingTx = null, sellerPublicKey = '' } = {}) {
    const signature = listingTx?.signature || '';
    const nft_id = String(nft?.id || nft?.uuid || listing?.nft_id || '').trim();
    if (!signature || !nft_id) {
      return null;
    }

    const seller =
      String(sellerPublicKey || this.mod.publicKey || '').trim() ||
      listingTx?.from?.[0]?.publicKey ||
      '';

    const title = String(listing.title || nft?.title || 'Untitled Item').trim();

    const entry = {
      id: `${signature}:${Date.now()}`,
      nft_id,
      seller,
      listing_signature: signature,
      title,
      phase: PHASE.CONFIRMING,
      status: 'Listing Submitted',
      detail: 'Waiting for confirmation…',
      started_at: Date.now(),
      completed_at: 0
    };

    this.listings.push(entry);
    this.emit(entry);

    if (typeof siteMessage === 'function') {
      siteMessage(`Listing submitted: ${title}`, 4000);
    }

    return entry;
  }

  findById(id = '') {
    return this.listings.find((l) => l.id === id) || null;
  }

  findByListingTx(signature = '') {
    if (!signature) {
      return null;
    }
    return (
      this.listings.find((l) => l.listing_signature === signature && l.phase !== PHASE.DISMISSED) ||
      null
    );
  }

  returnActiveListing() {
    const pending = this.listings.find((l) => l.phase === PHASE.CONFIRMING);
    if (pending) {
      return pending;
    }
    return this.listings.find((l) => l.phase === PHASE.COMPLETE) || null;
  }

  setPhase(id, phase, { status = '', detail = '' } = {}) {
    const entry = this.findById(id);
    if (!entry) {
      return null;
    }

    entry.phase = phase;
    if (status) {
      entry.status = status;
    }
    if (detail) {
      entry.detail = detail;
    }
    if (phase === PHASE.COMPLETE) {
      entry.completed_at = Date.now();
    }

    this.emit(entry);
    return entry;
  }

  markConfirmed(listingTxSignature = '') {
    const entry = this.findByListingTx(listingTxSignature);
    if (!entry) {
      return null;
    }
    if (entry.phase === PHASE.COMPLETE || entry.phase === PHASE.DISMISSED) {
      return entry;
    }

    const updated = this.setPhase(entry.id, PHASE.COMPLETE, {
      status: 'Listing Published',
      detail: 'Your NFT is now available in your Store.'
    });

    if (typeof siteMessage === 'function') {
      siteMessage(`Listing published: ${entry.title}`, 5000);
    }

    this.app.connection.emit('store-render-listings');
    return updated;
  }

  dismiss(id = '') {
    const entry = id ? this.findById(id) : this.returnActiveListing();
    if (!entry) {
      return null;
    }
    return this.setPhase(entry.id, PHASE.DISMISSED, {
      status: '',
      detail: ''
    });
  }

  onStoreListAsset({ tx, conf } = {}) {
    if (Number(conf) !== 0 || !tx?.signature) {
      return;
    }

    const txmsg = typeof tx.returnMessage === 'function' ? tx.returnMessage() : null;
    if (!txmsg || txmsg.module !== 'Store' || txmsg.request !== 'list-asset') {
      return;
    }
    if (txmsg.fulfill_sale) {
      return;
    }

    this.markConfirmed(tx.signature);
  }

  emitActive() {
    const active = this.returnActiveListing();
    if (active) {
      this.emit(active);
    }
  }

  emit(entry) {
    this.app.connection.emit('store-listing-lifecycle', entry);
  }
}

ListingLifecycle.PHASE = PHASE;

module.exports = ListingLifecycle;
