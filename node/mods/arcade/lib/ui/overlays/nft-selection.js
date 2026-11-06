const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoNFTCard = require('../../../../../lib/saito/ui/saito-nft/saito-nft-card');
const NftSelectionTemplate = require('./nft-selection.template');

class ArcadeNftSelectionOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.card_list = [];
    this.draft_selected = new Map();
    this.supported_nft_types = [];
    this.owner = '';
    this.onConfirm = null;
  }

  returnRecordType(rec = {}) {
    try {
      return this.app.wallet.extractNFTType(rec?.slip3?.utxo_key || '') || '';
    } catch (_) {
      return '';
    }
  }

  matchesSupportedType(nft_type = '') {
    return this.supported_nft_types.includes(nft_type);
  }

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

  recordFromNft(nft) {
    const nft_type =
      (typeof nft?.returnType === 'function' ? nft.returnType() : '') ||
      nft?.nft_type ||
      this.returnRecordType({ slip3: nft?.slip3 }) ||
      '';

    return {
      title: nft?.title || '',
      id: String(nft?.id ?? ''),
      owner: this.owner,
      nft_type
    };
  }

  render({
    supported_nft_types = [],
    initially_selected = [],
    owner = '',
    onConfirm = null
  } = {}) {
    this.supported_nft_types = Array.isArray(supported_nft_types) ? supported_nft_types : [];
    this.owner = owner || this.mod.publicKey || '';
    this.onConfirm = typeof onConfirm === 'function' ? onConfirm : null;
    this.draft_selected = new Map();

    for (const rec of initially_selected || []) {
      if (rec?.id != null && rec.id !== '') {
        this.draft_selected.set(String(rec.id), {
          title: rec.title || '',
          id: String(rec.id),
          owner: rec.owner || this.owner,
          nft_type: rec.nft_type || ''
        });
      }
    }

    this.overlay.show(NftSelectionTemplate());
    if (this.app?.browser?.addStylesheet) {
      this.app.browser.addStylesheet('/saito/css-imports/ui/saito-nft.css');
    }

    this.attachConfirmEvent();
    void this.renderNftGrid();
  }

  async renderNftGrid() {
    const container = document.querySelector('#arcade-nft-selection-overlay [data-nft-grid]');
    const instructionsEl = document.querySelector(
      '#arcade-nft-selection-overlay [data-nft-instructions]'
    );
    if (!container) {
      return;
    }

    await this.app.wallet.updateNFTList();
    const nft_list = this.dedupeNftRecords(
      (this.app.options.wallet.nfts || []).filter((rec) =>
        this.matchesSupportedType(this.returnRecordType(rec))
      )
    );

    this.card_list = [];
    container.innerHTML = '';

    if (!nft_list.length) {
      if (instructionsEl) {
        instructionsEl.innerHTML = `
          <div class="instructions">
            No matching NFTs were found in your wallet.
          </div>
        `;
      }
      return;
    }

    if (instructionsEl) {
      instructionsEl.innerHTML = '';
    }

    for (const rec of nft_list) {
      const card = new SaitoNFTCard(
        this.app,
        this.mod,
        '#arcade-nft-selection-overlay [data-nft-grid]',
        null,
        rec,
        (nft) => this.toggleSelection(nft, card)
      );
      this.card_list.push(card);
      await card.render();

      const id = rec?.id != null ? String(rec.id) : '';
      if (id && this.draft_selected.has(id)) {
        this.markCardSelected(card, true);
        const existing = this.draft_selected.get(id);
        if (card.nft) {
          this.draft_selected.set(id, {
            ...existing,
            ...this.recordFromNft(card.nft),
            title: card.nft.title || existing.title || ''
          });
        }
      }
    }
  }

  markCardSelected(card, selected) {
    const el = document.querySelector(card.my_qs);
    if (el) {
      el.classList.toggle('selected', !!selected);
    }
  }

  toggleSelection(nft, card) {
    if (nft?.id == null || nft.id === '') {
      return;
    }

    const id = String(nft.id);
    if (this.draft_selected.has(id)) {
      this.draft_selected.delete(id);
      this.markCardSelected(card, false);
      return;
    }

    this.draft_selected.set(id, this.recordFromNft(nft));
    this.markCardSelected(card, true);
  }

  confirmedRecords() {
    const records = [];
    for (const [id, rec] of this.draft_selected) {
      const card = this.card_list.find((c) => String(c?.nft?.id) === id);
      if (card?.nft) {
        records.push(this.recordFromNft(card.nft));
      } else {
        records.push(rec);
      }
    }
    return records;
  }

  attachConfirmEvent() {
    const btn = document.getElementById('arcade-nft-selection-confirm');
    if (!btn) {
      return;
    }

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const records = this.confirmedRecords();
      this.overlay.close();

      if (this.onConfirm) {
        this.onConfirm(records);
      }
    };
  }
}

module.exports = ArcadeNftSelectionOverlay;
