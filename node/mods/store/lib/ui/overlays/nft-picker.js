const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoNFTCard = require('../../../../../lib/saito/ui/saito-nft/saito-nft-card');
const NftPickerTemplate = require('./nft-picker.template');
const {
  isVaultRentalNftType,
  isSellableNftType,
  normalizeListingMode
} = require('../../categories');

class NftPickerOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.card_list = [];
    this.defaults = {};
    this.listing_mode = 'sell';
    this.onSelect = null;
    this.create_nft_overlay = null;
  }

  render(defaults = {}) {
    this.defaults = defaults || {};
    this.listing_mode = normalizeListingMode(this.defaults.listing_mode);

    this.overlay.show(NftPickerTemplate({ listing_mode: this.listing_mode }), () => {
      if (typeof this.defaults?.callback === 'function') {
        this.defaults.callback({ status: 'cancelled' });
      }
    });

    this.attachModeEvents();
    this.renderNftGrid();
  }

  returnRecordType(rec = {}) {
    try {
      return this.app.wallet.extractNFTType(rec?.slip3?.utxo_key || '') || '';
    } catch (_) {
      return '';
    }
  }

  matchesListingMode(nft_type = '') {
    if (this.listing_mode === 'rent') {
      return isVaultRentalNftType(nft_type);
    }
    return isSellableNftType(nft_type);
  }

  /**
   * One card per NFT id. Fractional slips of the same NFT share an id and
   * collide on #nft-card-${uuid}; keep the first record and let SaitoNFT
   * aggregate units via returnAllSlips / getTotalAmount.
   */
  dedupeNftRecords(nft_list = []) {
    const seen = new Set();
    const unique = [];
    for (const rec of nft_list) {
      const id = rec?.id;
      if (id == null || id === '') {
        unique.push(rec);
        continue;
      }
      const key = String(id);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(rec);
    }
    return unique;
  }

  hasNftPayload(nft) {
    return !!(nft?.tx || nft?.image || nft?.text || nft?.js || nft?.css || nft?.json);
  }

  /**
   * Prefer the picker card already hydrated from archive (same id), not a
   * sibling slip instance that still has an empty image/tx.
   */
  resolveSelectedNft(nft) {
    const incoming = nft?.nft || nft;
    if (!incoming) {
      return incoming;
    }
    const id = incoming.id;
    if (id == null || id === '') {
      return incoming;
    }

    const cards = this.card_list.filter((card) => String(card?.nft?.id) === String(id));
    const hydrated = cards.find((card) => this.hasNftPayload(card.nft)) || cards[0];
    return hydrated?.nft || incoming;
  }

  attachModeEvents() {
    const select = document.querySelector('.nft-picker [data-listing-mode-select]');
    if (!select) {
      return;
    }
    select.onchange = (e) => {
      const next = normalizeListingMode(e.target.value);
      if (next === this.listing_mode) {
        return;
      }
      this.listing_mode = next;
      this.defaults.listing_mode = next;
      this.render({ ...this.defaults, listing_mode: next, callback: this.defaults.callback });
    };
  }

  async renderNftGrid() {
    const container = document.querySelector('.nft-picker [data-nft-grid]');
    const statusEl = document.querySelector('.nft-picker [data-nft-status]');
    const instructionsEl = document.querySelector('.nft-picker [data-nft-instructions]');
    if (!container) {
      return;
    }

    await this.app.wallet.updateNFTList();
    const nft_list = this.dedupeNftRecords(
      (this.app.options.wallet.nfts || []).filter((rec) =>
        this.matchesListingMode(this.returnRecordType(rec))
      )
    );

    this.card_list.forEach((card) => {
      card.delete_me = true;
    });

    for (const rec of nft_list) {
      const existing = this.card_list.find(
        (card) => rec?.id != null && rec.id !== '' && String(card?.nft?.id) === String(rec.id)
      );
      if (existing) {
        existing.callback = (nft) => this.handleSelect(nft);
        delete existing.delete_me;
        continue;
      }
      this.card_list.push(
        new SaitoNFTCard(this.app, this.mod, '.nft-picker [data-nft-grid]', null, rec, (nft) =>
          this.handleSelect(nft)
        )
      );
    }

    for (let i = this.card_list.length - 1; i >= 0; i--) {
      if (this.card_list[i].delete_me) {
        this.card_list.splice(i, 1);
      }
    }

    container.innerHTML = '';

    if (!nft_list.length) {
      if (statusEl) {
        statusEl.innerHTML = NftPickerTemplate.emptyInstructions(this.listing_mode);
      }
      if (instructionsEl) {
        instructionsEl.hidden = false;
        instructionsEl.innerHTML = NftPickerTemplate.createPrompt(this.listing_mode);
        if (this.listing_mode === 'sell') {
          this.attachEmptyEvents();
        }
      }
      return;
    }

    if (statusEl) {
      statusEl.innerHTML = '';
    }
    if (instructionsEl) {
      instructionsEl.hidden = true;
      instructionsEl.innerHTML = '';
    }

    for (const card of this.card_list) {
      await card.render();
    }
  }

  attachEmptyEvents() {
    const createLink = document.getElementById('nft-picker-create-link');
    if (!createLink) {
      return;
    }

    const open = (e) => {
      e.preventDefault();
      this.openCreateNft();
    };

    createLink.onclick = open;
    createLink.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openCreateNft();
      }
    };
  }

  /**
   * Close the picker and open Create NFT.
   * Prefers the header-owned instance so we do not register a second listener.
   */
  openCreateNft() {
    this.overlay.close();

    let createNft =
      this.mod.header &&
      this.mod.header.select_nft_overlay &&
      this.mod.header.select_nft_overlay.create_nft_overlay;

    if (!createNft) {
      if (!this.create_nft_overlay) {
        const CreateNFT = require('../../../../../lib/saito/ui/saito-nft/overlays/create-overlay');
        this.create_nft_overlay = new CreateNFT(this.app, this.mod);
      }
      createNft = this.create_nft_overlay;
    }

    createNft.render(this.defaults || {});
  }

  async handleSelect(nft) {
    const selected = this.resolveSelectedNft(nft);

    if (selected && !this.hasNftPayload(selected) && typeof selected.fetchTransaction === 'function') {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        selected.fetchTransaction(finish);
        setTimeout(finish, 5000);
      });
    }

    const nft_type =
      (typeof selected?.returnType === 'function' ? selected.returnType() : '') ||
      selected?.nft_type ||
      '';
    if (!this.matchesListingMode(nft_type)) {
      siteMessage(
        this.listing_mode === 'rent'
          ? 'Choose a Vault rental NFT (vault-nft-rental) to list for rent.'
          : 'That NFT is not available for sale listings. Switch to RENT or pick another NFT.',
        3500
      );
      return;
    }

    // Avoid treating a successful pick as a cancel when the picker closes.
    if (this.defaults) {
      this.defaults.callback = null;
      this.defaults.listing_mode = this.listing_mode;
    }
    this.overlay.close();

    if (typeof this.onSelect === 'function') {
      this.onSelect(selected, { ...this.defaults, listing_mode: this.listing_mode });
    }
  }
}

module.exports = NftPickerOverlay;
