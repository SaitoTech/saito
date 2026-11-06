const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoNFTCard = require('../../../../../lib/saito/ui/saito-nft/saito-nft-card');
const Card = require('../../card');
const MyCardsTemplate = require('./my-cards.template');

class MyCardsOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.card_list = [];
  }

  returnRecordType(rec = {}) {
    try {
      return this.app.wallet.extractNFTType(rec?.slip3?.utxo_key || '') || '';
    } catch (_) {
      return '';
    }
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

  async render() {
    this.overlay.show(MyCardsTemplate());
    if (this.app?.browser?.addStylesheet) {
      this.app.browser.addStylesheet('/saito/css-imports/ui/saito-nft.css');
    }
    await this.renderNftGrid();
  }

  async renderNftGrid() {
    const container = document.querySelector('.tscardgen-my-cards [data-nft-grid]');
    const instructionsEl = document.querySelector('.tscardgen-my-cards [data-nft-instructions]');
    if (!container) {
      return;
    }

    try {
      await this.app.wallet.updateNFTList();
    } catch (err) {
      console.error('TSCardGen: updateNFTList failed', err);
    }

    const nft_list = this.dedupeNftRecords(
      (this.app.options.wallet.nfts || []).filter(
        (rec) => this.returnRecordType(rec) === Card.NFT_TYPE
      )
    );

    this.card_list = [];
    container.innerHTML = '';

    if (!nft_list.length) {
      if (instructionsEl) {
        instructionsEl.innerHTML = `
          <div class="instructions">
            You do not yet have any Twilight Struggle card NFTs in your wallet.
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
        '.tscardgen-my-cards [data-nft-grid]',
        null,
        rec,
        null
      );
      this.card_list.push(card);
      await card.render();
    }
  }
}

module.exports = MyCardsOverlay;
