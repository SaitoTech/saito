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
    const nft_list = (this.app.options.wallet.nfts || []).filter((rec) =>
      this.matchesListingMode(this.returnRecordType(rec))
    );

    this.card_list = [];
    container.innerHTML = '';

    if (!nft_list.length) {
      if (statusEl) {
        statusEl.innerHTML = NftPickerTemplate.emptyInstructions(this.listing_mode);
      }
      if (instructionsEl) {
        if (this.listing_mode === 'sell') {
          instructionsEl.hidden = false;
          instructionsEl.innerHTML = NftPickerTemplate.createPrompt();
          this.attachEmptyEvents();
        } else {
          instructionsEl.hidden = true;
          instructionsEl.innerHTML = '';
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

    for (const rec of nft_list) {
      const card = new SaitoNFTCard(
        this.app,
        this.mod,
        '.nft-picker [data-nft-grid]',
        null,
        rec,
        (nft) => {
          this.handleSelect(nft);
        }
      );
      this.card_list.push(card);
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
    if (this.defaults) {
      this.defaults.callback = null;
    }
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

    createNft.render();
  }

  async handleSelect(nft) {
    const selected = nft?.nft || nft;

    if (selected && (!selected.tx_fetched || !selected.image)) {
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
