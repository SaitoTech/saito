const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoNFT = require('../../../../../lib/saito/ui/saito-nft/saito-nft');
const ListingFieldEdit = require('./listing-field-edit');
const RentalListingTemplate = require('./rental-listing.template');

class RentalListingOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.field_edit = new ListingFieldEdit(app, mod);
    this.create_nft_overlay = null;
    this.onBack = null;

    this.phase = 'info';
    this.defaults = {};
    // Source Vault rental NFT (vault-nft-rental) — never listed or modified.
    this.source_nft = null;
    this.rental_nft = null;
    this.file_id = '';
    this.source_name = '';

    this.pending_nft_id = null;
    this.pending_nft_signature = null;
    this.pending_nft_tx = null;

    this.form = {
      price: '1',
      duration_hours: 1,
      rights: 'all',
      amount: 1,
      title: '',
      description: ''
    };
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

  returnMediaHtml(nft) {
    if (nft?.image) {
      return RentalListingTemplate.mediaImage(this.escapeHtml(nft.image));
    }
    const text =
      nft?.text || nft?.json || nft?.description || nft?.title || 'Store Rental NFT';
    return RentalListingTemplate.mediaText(this.escapeHtml(text));
  }

  /**
   * Vault file_id lives on the source vault-nft-rental mint tx message data
   * (same source Vault load-nfts / download use).
   */
  async resolveFileId(nft) {
    if (!nft) {
      return '';
    }

    if (!nft.tx && typeof nft.fetchTransaction === 'function') {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        nft.fetchTransaction(finish);
        setTimeout(finish, 8000);
      });
    }

    const data = nft.tx?.returnMessage?.()?.data;
    if (data?.file_id) {
      return String(data.file_id);
    }

    if (nft.json) {
      try {
        const parsed = typeof nft.json === 'string' ? JSON.parse(nft.json) : nft.json;
        const from_json = parsed?.file_id || parsed?.data?.file_id;
        if (from_json) {
          return String(from_json);
        }
      } catch (_) {
        /* ignore */
      }
    }

    const vault = this.app.modules.returnModule('Vault');
    const nft_id = nft.id || nft.uuid || '';
    const cached =
      (typeof vault?.getCachedNftFileMetadata === 'function'
        ? vault.getCachedNftFileMetadata(nft_id)
        : null) || this.app.options?.vault?.files?.[nft_id];
    if (cached?.file_id) {
      return String(cached.file_id);
    }

    return '';
  }

  returnSourceName(nft) {
    const data = nft?.tx?.returnMessage?.()?.data || {};
    return data.filename || data.file_name || nft?.title || nft?.id || 'Protected file';
  }

  normalizeHours(raw) {
    let hours = parseInt(raw, 10);
    if (!Number.isFinite(hours) || hours < 1) {
      hours = 1;
    }
    if (hours > 24) {
      hours = 24;
    }
    return hours;
  }

  normalizeAmount(raw, max = 100000000) {
    let amount = parseInt(raw, 10);
    if (!Number.isFinite(amount) || amount < 1) {
      amount = 1;
    }
    if (amount > max) {
      amount = max;
    }
    return amount;
  }

  async render({ source_nft = null, master_nft = null, defaults = {}, phase = null } = {}) {
    this.defaults = defaults || {};
    // master_nft kept as alias for older callers.
    this.source_nft = source_nft?.nft || source_nft || master_nft?.nft || master_nft || this.source_nft;

    if (!this.source_nft) {
      siteMessage('Select a Vault rental NFT first.', 3000);
      if (typeof this.onBack === 'function') {
        this.onBack({ ...this.defaults, listing_mode: 'rent' });
      }
      return;
    }

    if (!this.file_id) {
      this.file_id = await this.resolveFileId(this.source_nft);
    }
    if (!this.file_id) {
      siteMessage('Could not read file_id from this Vault rental NFT.', 4000);
      if (typeof this.onBack === 'function') {
        this.onBack({ ...this.defaults, listing_mode: 'rent' });
      }
      return;
    }

    this.source_name = this.returnSourceName(this.source_nft);
    this.phase = phase || (this.rental_nft ? 'ready' : 'info');

    if (this.phase === 'ready') {
      this.renderReady();
      return;
    }
    this.renderInfo();
  }

  renderInfo() {
    this.phase = 'info';

    const view = {
      sourceName: this.escapeHtml(this.source_name),
      priceDisplay: `${this.form.price} SAITO`,
      durationHours: this.form.duration_hours,
      amount: this.form.amount
    };

    this.overlay.show(RentalListingTemplate.infoTemplate(view), () => {
      if (typeof this.defaults?.callback === 'function') {
        this.defaults.callback({ status: 'cancelled' });
      }
    });
    this.attachInfoEvents();
  }

  renderReady() {
    this.phase = 'ready';
    const nft = this.rental_nft;
    const nftId = nft?.id || nft?.uuid || '';
    const seller = this.mod.publicKey || '';

    if (!this.form.title) {
      this.form.title = nft?.title || 'Rental NFT';
    }
    if (!this.form.description) {
      this.form.description = nft?.description || '';
    }

    const minted =
      Number(nft?.getTotalAmount?.() || nft?.amount || this.form.amount) || this.form.amount;
    this.form.amount = this.normalizeAmount(minted, minted);

    const view = {
      nftIdenticon: this.app?.keychain?.returnIdenticon?.(nftId || seller) || '',
      listingTitle: this.escapeHtml(this.form.title),
      description: this.escapeHtml(this.form.description),
      priceDisplay: `${this.form.price} SAITO`,
      durationHours: this.form.duration_hours,
      rights: this.form.rights || 'all',
      amount: this.form.amount,
      createdDate: new Date().toLocaleDateString(),
      mediaHtml: this.returnMediaHtml(nft)
    };

    this.overlay.show(RentalListingTemplate.readyTemplate(view), () => {
      if (typeof this.defaults?.callback === 'function') {
        this.defaults.callback({ status: 'cancelled' });
      }
    });
    this.attachReadyEvents();
  }

  attachInfoEvents() {
    const root = document.querySelector('.rental-listing.info');
    if (!root) {
      return;
    }

    root.querySelector('[data-field="duration"]')?.addEventListener('change', (e) => {
      this.form.duration_hours = this.normalizeHours(e.target.value);
    });

    root.querySelector('[data-field="rights"]')?.addEventListener('change', (e) => {
      this.form.rights = e.target.value || 'all';
    });

    const amountInput = root.querySelector('input[data-field="amount"]');
    if (amountInput) {
      amountInput.addEventListener('change', (e) => {
        this.form.amount = this.normalizeAmount(e.target.value);
        e.target.value = String(this.form.amount);
      });
    }

    root.querySelector('[data-edit="price"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.field_edit.render({
        title: 'Edit Rental Price',
        value: String(this.form.price),
        placeholder: 'Price in SAITO',
        onSave: (raw) => {
          const cleaned = String(raw || '')
            .trim()
            .replace(/[^\d.]/g, '');
          if (!cleaned) {
            return false;
          }
          this.form.price = cleaned;
          const el = root.querySelector('[data-field="price"]');
          if (el) {
            el.textContent = `${cleaned} SAITO`;
          }
          return true;
        }
      });
    });

    root.querySelector('[data-action="create"]')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.openCreateNft();
    });
  }

  attachReadyEvents() {
    const root = document.querySelector('.listing-detail.rental-ready');
    if (!root) {
      return;
    }

    // Duration / rights / amount are fixed after mint — only presentation + listing price/title/desc.

    root.querySelector('[data-edit="title"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.field_edit.render({
        title: 'Edit Title',
        value: this.form.title,
        placeholder: 'Listing title',
        onSave: (raw) => {
          const next = String(raw || '').trim();
          if (!next) {
            return false;
          }
          this.form.title = next;
          const el = root.querySelector('[data-field="title"]');
          if (el) {
            el.textContent = next;
          }
          return true;
        }
      });
    });

    root.querySelector('[data-edit="description"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.field_edit.render({
        title: 'Edit Description',
        value: this.form.description,
        multiline: true,
        placeholder: 'Describe this rental',
        onSave: (raw) => {
          const next = String(raw ?? '').trim();
          this.form.description = next;
          const el = root.querySelector('[data-field="description"]');
          if (el) {
            el.textContent = next || 'No description provided.';
          }
          return true;
        }
      });
    });

    root.querySelector('[data-edit="price"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.field_edit.render({
        title: 'Edit Rental Price',
        value: String(this.form.price),
        placeholder: 'Price in SAITO',
        onSave: (raw) => {
          const cleaned = String(raw || '')
            .trim()
            .replace(/[^\d.]/g, '');
          if (!cleaned) {
            return false;
          }
          this.form.price = cleaned;
          const el = root.querySelector('[data-field="price"]');
          if (el) {
            el.textContent = `${cleaned} SAITO`;
          }
          return true;
        }
      });
    });

    root.querySelector('[data-action="submit"]')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.submitListing();
    });
  }

  /**
   * Stack-style: hide parent, open shared Create NFT with type locked and
   * rental create_data (file_id / duration / rights) attached for createData.
   */
  async openCreateNft() {
    if (!this.file_id) {
      siteMessage('Missing file_id for this Vault rental NFT.', 3000);
      return;
    }

    this.form.duration_hours = this.normalizeHours(this.form.duration_hours);
    this.form.amount = this.normalizeAmount(this.form.amount);
    this.form.rights = this.form.rights || 'all';

    let createNft = this.mod.header?.select_nft_overlay?.create_nft_overlay || null;

    if (!createNft) {
      if (!this.create_nft_overlay) {
        const CreateNFT = require('../../../../../lib/saito/ui/saito-nft/overlays/create-overlay');
        this.create_nft_overlay = new CreateNFT(this.app, this.mod);
      }
      createNft = this.create_nft_overlay;
    }

    const hours = this.form.duration_hours;
    const duration_ms = hours * 60 * 60 * 1000;

    this.overlay.hide();

    createNft.render({
      type: 'store-nft-rental',
      quantity: this.form.amount,
      deposit: this.form.amount,
      locked: ['type', 'quantity'],
      create_data: {
        file_id: this.file_id,
        duration_hours: hours,
        duration_ms,
        rights: this.form.rights || 'all'
      },
      callback: (result) => {
        if (result?.status === 'created') {
          this.pending_nft_id = result.nft_id || null;
          this.pending_nft_signature = result.signature || null;
          this.pending_nft_tx = result.tx || null;

          this.watchMintTransaction(result.tx);
          return;
        }

        if (result?.status === 'cancelled') {
          this.renderInfo();
        }
      }
    });
  }

  watchMintTransaction(tx) {
    if (!this.mod.transaction_monitor) {
      console.error('Store: transaction_monitor is not initialized');
      this.renderInfo();
      return;
    }

    this.mod.transaction_monitor.render({
      tx,
      title: 'Creating Rental NFT',
      lead: 'Your Store Rental NFT is being broadcast to the Saito network.',
      subtitle: 'Waiting for confirmation...',
      successTitle: 'Rental NFT Confirmed',
      successLead: 'Your rental inventory NFT is confirmed and ready to list.',
      successActionLabel: 'Continue',
      callback: async (result) => {
        if (result?.status === 'confirmed') {
          await this.onMintConfirmed();
          return;
        }
        if (result?.status === 'cancelled') {
          this.renderInfo();
        }
      }
    });
  }

  async onMintConfirmed() {
    await this.app.wallet.updateNFTList();

    const nft_list = this.app.options.wallet.nfts || [];
    let rec = null;
    for (const r of nft_list) {
      if (this.pending_nft_signature && r.tx_sig === this.pending_nft_signature) {
        rec = r;
        break;
      }
      if (this.pending_nft_id && r.id === this.pending_nft_id) {
        rec = r;
        break;
      }
    }

    this.rental_nft = new SaitoNFT(this.app, this.mod, this.pending_nft_tx || null, rec);
    if (!this.rental_nft.tx && typeof this.rental_nft.fetchTransaction === 'function') {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        this.rental_nft.fetchTransaction(finish);
        setTimeout(finish, 8000);
      });
    }

    if (typeof this.rental_nft.buildNFTData === 'function' && this.rental_nft.tx) {
      this.rental_nft.buildNFTData(this.rental_nft.tx);
    }

    // Prefer duration/rights from the minted NFT data when present.
    const data = this.rental_nft.tx?.returnMessage?.()?.data || this.rental_nft.data || {};
    if (data.duration_hours) {
      this.form.duration_hours = this.normalizeHours(data.duration_hours);
    }
    if (data.rights) {
      this.form.rights = data.rights;
    }

    const minted = Number(
      this.rental_nft.getTotalAmount?.() || this.rental_nft.amount || this.form.amount
    );
    if (Number.isFinite(minted) && minted > 0) {
      this.form.amount = minted;
    }

    this.form.title = this.rental_nft.title || this.form.title || 'Rental NFT';
    this.form.description = this.rental_nft.description || this.form.description || '';

    this.renderReady();
  }

  async submitListing() {
    if (!this.rental_nft) {
      siteMessage('Create the rental NFT before listing.', 3000);
      return;
    }

    try {
      this.form.duration_hours = this.normalizeHours(this.form.duration_hours);
      const max = Number(
        this.rental_nft.getTotalAmount?.() || this.rental_nft.amount || this.form.amount
      );
      this.form.amount = this.normalizeAmount(this.form.amount, max);

      const hours = this.form.duration_hours;
      const listing = {
        title: this.form.title || this.rental_nft.title || 'Rental NFT',
        description: this.form.description || this.rental_nft.description || '',
        price: this.form.price,
        quantity_total: this.form.amount,
        quantity_available: this.form.amount,
        listing_mode: 'rent',
        rental_duration_hours: hours,
        rental_duration_ms: hours * 60 * 60 * 1000,
        rental_rights: this.form.rights || 'all',
        file_id: this.file_id
      };

      this.rental_nft.title = listing.title;
      this.rental_nft.description = listing.description;

      const tx = await this.mod.createListAssetTransaction(this.rental_nft, listing);
      await this.app.network.propagateTransaction(tx);

      if (typeof this.defaults?.callback === 'function') {
        this.defaults.callback({ status: 'listed', tx });
        this.defaults.callback = null;
      }

      this.beginListingProgress(tx, listing);
    } catch (err) {
      console.error('Store: rental listing failed', err);
      alert(err?.message || 'Rental listing failed');
    }
  }

  beginListingProgress(tx, listing) {
    if (!this.mod.listing_lifecycle) {
      const ListingLifecycle = require('../listing-lifecycle');
      this.mod.listing_lifecycle = new ListingLifecycle(this.app, this.mod);
    }

    const entry = this.mod.listing_lifecycle.begin({
      nft: this.rental_nft,
      listing,
      listingTx: tx,
      sellerPublicKey: this.mod.publicKey
    });

    this.overlay.close();

    const title = entry?.title || listing?.title || '';
    const safeTitle = this.escapeHtml(title);
    const lead = safeTitle
      ? `Your rental listing for <strong>${safeTitle}</strong> has been broadcast to the Saito network.`
      : 'Your rental listing has been broadcast to the Saito network.';

    this.mod.transaction_monitor.render({
      tx,
      title: 'Rental Listing Submitted',
      lead,
      successTitle: 'Listing Successful',
      successLead: 'You have successfully added a rental item to your Saito Store.',
      callback: (result) => {
        if (result?.status === 'cancelled') {
          const active = this.mod.listing_lifecycle?.returnActiveListing?.();
          if (active) {
            this.mod.listing_lifecycle.dismiss(active.id);
          }
        }
      }
    });

    if (this.mod.main?.openStorefront && this.mod.publicKey) {
      Promise.resolve(
        this.mod.main.openStorefront(this.mod.publicKey, {
          celebrate: true,
          admin: true
        })
      ).catch((err) => {
        console.warn('Store: openStorefront after rental list failed', err?.message || err);
      });
    }
  }
}

module.exports = RentalListingOverlay;
