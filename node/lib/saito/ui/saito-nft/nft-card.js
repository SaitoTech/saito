const NftCardTemplate = require('./nft-card.template');

class NftCard {
  constructor(app, mod, container = '', tx = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;

    //
    // tx details
    //
    this.tx = tx;
    this.id = null;
    this.tx_sig = null;
    this.slip1 = null;
    this.slip2 = null;
    this.slip3 = null;

    //
    // nft details
    //
    this.amount = BigInt(0); // nolans
    this.deposit = BigInt(0); // nolans
    this.image = '';
    this.text = '';
    this.items = []; // multiple nfts of same id saved here

    //
    // UI helpers
    //
    this.idx = null;
    this.has_local_tx = false;
    this.nft_list = [];
    this.render_type = null;
  }

  async render() {
    if (!document.querySelector(this.container)) {
      console.warn('nft card -- missing container');
      return;
    }

    // If there are multiple items for same id, render them all.
    if (Array.isArray(this.items) && this.items.length > 1) {
      for (const item of this.items) {
        // VM inherits methods from the instance so template can call class methods
        const vm = Object.create(this);
        Object.assign(vm, {
          id: item.id,
          slip1: item.slip1,
          slip2: item.slip2,
          slip3: item.slip3,
          amount: item.amount,
          deposit: item.deposit,
          idx: item.idx
        });

        this.app.browser.prependElementToSelector(
          NftTemplate(this.app, this.mod, vm),
          this.container
        );
      }
    } else {
      // Single record (backward-compatible behavior)
      this.app.browser.prependElementToSelector(
        NftTemplate(this.app, this.mod, this),
        this.container
      );
    }

    // Ensure DOM is in place
    setTimeout(() => this.attachEvents(), 0);
  }

  async attachEvents() {
    // Multiple cards
    if (Array.isArray(this.items) && this.items.length > 1) {
      for (const item of this.items) {
        const el = document.querySelector(`#nft-card-${item.idx}`);
        if (!el) continue;

        // Avoid stacking listeners when re-rendering
        el.onclick = null;
        el.onclick = () => {
          const nft = Object.create(this);
          Object.assign(nft, {
            id: item.id,
            slip1: item.slip1,
            slip2: item.slip2,
            slip3: item.slip3,
            amount: item.amount,
            deposit: item.deposit,
            idx: item.idx
          });

          this.app.connection.emit('saito-nft-details-render-request', nft);
        };
      }
      return;
    }

    // Single card (backward compatible)
    const el = document.querySelector(`#nft-card-${this.idx}`);
    if (el) {
      el.onclick = () => {
        this.app.connection.emit('saito-nft-details-render-request', this);
      };
    }
  }

  async createFromId(id) {
    this.id = id;
    if (!this.id) return;

    // Try local archive
    await this.app.storage.loadTransactions(
      { field4: this.id },
      (txs) => {
        if (Array.isArray(txs) && txs.length > 0) {
          // ✅ only extract image/text
          this.setImageTextFromTx(txs[0]);
        }
      },
      'localhost'
    );

    // Try remote if not found locally
    if (!this.has_local_tx) {
      const peers = await this.mod.app.network.getPeers();
      const peer = peers?.[0] ?? null;
      if (peer) {
        await this.app.storage.loadTransactions(
          { field4: this.id },
          (txs) => {
            if (Array.isArray(txs) && txs.length > 0) {
              // ✅ only extract image/text
              this.setImageTextFromTx(txs[0]);
            }
          },
          peer
        );
      }
    }

    console.log('nft.createFromId() id: ', this.id);

    // Populate slips for all entries with this.id
    this.getSlipsFromWallet(this.id, this.tx_sig ?? null);
  }

  createFromTx(tx) {
    this.has_local_tx = true;
    this.tx = tx;
    this.tx_sig = this.tx?.signature ?? this.tx_sig ?? null;

    // ✅ use the new method here
    this.setImageTextFromTx(tx);

    // Build items directly from the provided tx
    this.getSlipsFromTx(tx);
  }

  /**
   * Wallet-backed slip resolution (used by createFromId).
   * Reads from app.options.wallet.nfts.
   */
  getSlipsFromWallet(id = null, tx_sig = null) {
    const nfts = this.app?.options?.wallet?.nfts || [];
    if (!Array.isArray(nfts) || nfts.length === 0) return;

    const candidates = nfts.filter(
      (n) => (id != null && n?.id === id) || (tx_sig != null && n?.tx_sig === tx_sig)
    );
    if (candidates.length === 0) return;

    // keep helpers meaningful
    this.nft_list = candidates;

    const records = candidates.map((c) => ({
      id: c?.id ?? null,
      tx_sig: c?.tx_sig ?? null,
      slip1: c?.slip1 ?? null,
      slip2: c?.slip2 ?? null,
      slip3: c?.slip3 ?? null
    }));

    console.log('nft.createFromId() records: ', records);

    buildItemsFromRecords(this, records);
  }

  /**
   * TX-backed slip resolution (used by createFromTx).
   * Derives nft_id and slips entirely from the provided tx, without needing wallet entries.
   */
  getSlipsFromTx(tx = this.tx) {
    if (!tx) return;

    this.tx = tx;
    this.tx_sig = tx?.signature ?? this.tx_sig ?? null;

    const msg = tx?.returnMessage ? tx.returnMessage() : {};
    const data = msg?.data ?? {};

    const slip1 = tx?.to[0] ?? null;
    const slip2 = tx?.to[1] ?? null;
    const slip3 = tx?.to[2] ?? null;

    // Derive id if not already set
    this.id = this.id ?? computeNftIdFromTx(tx);

    const records = [
      {
        id: this.id ?? null,
        tx_sig: this.tx_sig ?? null,
        slip1,
        slip2,
        slip3
      }
    ];

    buildItemsFromRecords(this, records);
  }

  /**
   * Extracts NFT image/text data from a transaction
   * and assigns it to this.image / this.text.
   */
  setImageTextFromTx(tx) {
    if (!tx) return;

    const tx_msg = typeof tx?.returnMessage === 'function' ? tx.returnMessage() : {};
    const data = tx_msg?.data ?? {};

    if (typeof data.image !== 'undefined') {
      this.image = data.image;
    }

    if (typeof data.text !== 'undefined') {
      this.text =
        typeof data.text === 'object' && data.text !== null
          ? JSON.stringify(data.text, null, 2)
          : String(data.text);
    }
  }
}

module.exports = NftCard;
