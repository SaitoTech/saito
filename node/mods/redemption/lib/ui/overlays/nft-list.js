const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoNFT = require('./../../../../../lib/saito/ui/saito-nft/saito-nft');
const NftListTemplate = require('./nft-list.template');
const RedemptionCard = require('../redemption-card');
const RequestOverlay = require('./request');
const { REDEMPTION_NFT_TYPE, inspectWalletNft } = require('../../transactions');

class NftListOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.request = new RequestOverlay(app, mod, this);
    this.cards = [];
  }

  async render() {
    this.overlay.show(NftListTemplate());
    await this.load();
  }

  async load() {
    const grid = document.querySelector('.redemption-nft-grid');
    const empty = document.querySelector('.redemption-list-empty');
    if (!grid) {
      return;
    }
    grid.innerHTML = '';
    this.cards = [];

    if (typeof this.app.wallet?.updateNFTList === 'function') {
      await this.app.wallet.updateNFTList();
    }

    const records = this.app.options?.wallet?.nfts || [];
    const matched = records.filter((record) => {
      return this.app.wallet.extractNFTType(record?.slip3?.utxo_key || '') === REDEMPTION_NFT_TYPE;
    });

    if (!matched.length) {
      if (empty) {
        empty.hidden = false;
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }

    const statuses = await this.mod.requestStatuses(
      matched.map((record) => record.id)
    );

    for (const record of matched) {
      const nft = new SaitoNFT(this.app, this.mod, null, record);
      try {
        await nft.fetchTransaction();
      } catch (err) {
        nft.tx = nft.tx || null;
      }
      const server = nft.tx?.returnMessage?.()?.data?.server_publickey || '';
      const connected = this.mod.peerForServer(server);
      const claim = await inspectWalletNft(this.app, nft, {
        processing_server: connected ? server : '',
        server_connected: connected ? true : false,
        existing_status: statuses[record.id] || ''
      });
      const card = new RedemptionCard(this.app, this.mod, '.redemption-nft-grid', record, claim, () => {
        this.request.open(nft, claim);
      });
      this.cards.push(card);
      await card.render();
    }
  }
}

module.exports = NftListOverlay;
