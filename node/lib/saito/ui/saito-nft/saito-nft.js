class SaitoNFT {
  constructor(app, mod, tx = null, data = null) {
    this.app = app;
    this.mod = mod;

    //
    // nft details from app.options.wallet
    //
    this.id = data?.id;
    if (data?.nft_id) {
      this.id = data?.nft_id;
    }
    this.slip1 = data?.slip1;
    this.slip2 = data?.slip2;
    this.slip3 = data?.slip3;

    //
    // Information encoded in the slips
    //
    this.uuid = null;
    this.creator = '';
    this.amount = BigInt(0); // How many nfts of this id of this slip
    this.deposit = BigInt(0); // nolans
    this.nft_type = '';

    //
    // and/or general meta data
    //
    this.metadata = data;
    this.title = data?.title || '';
    this.description = data?.description || '';

    //
    // tx details
    //
    this.tx = tx;

    // Prioritize the tx_sig from the wallet_nft_list rather than the provided tx...
    this.tx_sig = data?.nfttx_sig || data?.tx_sig || tx.signature || '';

    //
    // NFT content
    //
    this.image = '';
    this.text = '';
    this.json = '';
    this.js = '';
    this.css = '';

    //
    // UI helpers
    //
    this.tx_fetched = false;
    this.load_failed = false;

    if (tx != null) {
      // Analyze TX for slips and extra information
      this.buildNFTData(tx);
    } else {
      // Assuming we had slips in data from our wallet, just extract them
      this.parseSlips();
    }
  }

  /**
   * Let modules respond to `saito-nft-transfer` mutate the outbound tx before sign/propagate.
   * @param {*} newtx unsigned transaction
   * @param {string} receiver recipient public key
   * @param {object} [data={}] optional transfer intent (e.g. { delegated: true })
   * @returns {Promise<*>} updated tx, or null if a handler blocked the send (after salert)
   */
  async modifyBeforeSend(newtx, receiver, data = {}) {
    const nft_type =
      this.nft_type || (typeof this.returnType === 'function' ? this.returnType() : null);
    const handlers = this.app.modules.getRespondTos('saito-nft-transfer', this);

    for (const modobj of handlers) {
      if (!modobj?.class || !modobj.class.includes(nft_type) || !nft_type) {
        continue;
      }
      if (typeof modobj.onTransfer === 'function') {
        try {
          newtx = await modobj.onTransfer(this, newtx, receiver, data);
        } catch (err) {
          console.error('onTransfer() failed in module...', err);
          salert(`NFT transfer blocked by module...`);
          return null;
        }
      }
    }

    return newtx;
  }

  async fetchTransaction(callback = null, localhost_only = false) {
    const my_callback = () => {
      this.load_failed = false;
      if (callback) {
        callback();
      }
    };

    if (!this.id) {
      console.error('0.5 Unable to fetch NFT transaction (no nft id found)');
      my_callback();
      return;
    }

    this.tx_fetched = true;

    // If we already have the transaction AND the image/data, we're done
    if (this.tx && (this.image || this.text || this.js || this.css || this.json)) {
      console.debug('NFT already has all data');
      my_callback();
      return;
    }

    // If we have the transaction but no image/data, try to extract it
    if (this.tx != null) {
      console.debug('Building nft data from transaction');
      this.buildNFTData(this.tx);
      my_callback();
      return;
    }

    const search_cond = this.tx_sig ? { sig: this.tx_sig } : { field4: this.id };

    console.debug('Fetching nft transaction from archive using: ', search_cond);
    await this.app.storage.loadTransactions(
      search_cond,
      async (txs) => {
        if (txs?.length > 0) {
          console.debug('local archive returned nft');
          this.buildNFTData(txs[0]);
          my_callback();
        } else {
          // Try again locally with the other search condition...
          if (this.tx_sig) {
            await this.app.storage.loadTransactions({ field4: this.id }, async (txs) => {
              if (txs?.length > 0) {
                console.debug('local archive returned nft');
                this.buildNFTData(txs[0]);
                my_callback();
              }
            });
          }

          if (localhost_only) {
            return null;
          }

          const remote_callback = () => {};

          console.debug('trying remote archive for nft');
          //
          // try remote host (ours IS **NOW**  INDEXING NFT TXS)
          //
          let peer = await this.app.network.getPeers();

          this.app.storage.loadTransactions(
            search_cond,
            (txs) => {
              if (txs?.length > 0) {
                console.debug('remote archive returned nft');
                this.buildNFTData(txs[0]);

                this.app.storage.saveTransaction(
                  txs[0],
                  { field4: this.id, preserve: 1 },
                  'localhost'
                );

                my_callback();
              } else {
                this.load_failed = true;
              }
            },
            peer?.length ? peer[0] : null
          );
        }
      },
      'localhost'
    );

    return null;
  }

  buildNFTData(tx) {
    let this_self = this;

    if (!tx) {
      return;
    }

    //
    // tx is available we can extract slips & txmsg data (img/text)
    //
    this.extractNFTData(tx);

    // If we created the NFT with a specific TX_signature but not the TX
    // we only want to save the proper transaction
    if (!this.tx && this.tx_sig == tx.signature) {
      this.tx = tx;
    }

    //
    // ovveride only if value already not set
    //
    this.slip1 ??= this.extractSlipObject(this.tx?.to?.[0] ?? null);
    this.slip2 ??= this.extractSlipObject(this.tx?.to[1] ?? null);
    this.slip3 ??= this.extractSlipObject(this.tx?.to[2] ?? null);

    this.parseSlips();
  }

  resetNFT(data) {
    this.slip1 = data?.slip1;
    this.slip2 = data?.slip2;
    this.slip3 = data?.slip3;
    this.tx_sig = data?.tx_sig || this.tx_sig;
    this.parseSlips();
  }

  parseSlips() {
    this.amount = BigInt(this.slip1?.amount || 0);
    this.creator = this.slip1?.public_key || '';
    this.uuid = this.slip3?.public_key || '';
    this.deposit = BigInt(this.slip2?.amount || 0);
    this.nft_type = this.returnType();
  }

  //
  // Extracts NFT image/text, tx_sig, txmsg data from a transaction
  //
  extractNFTData(tx) {
    if (!tx) {
      return;
    }

    let processed = false;
    let has_image = false;
    let has_css = false;
    let has_js = false;
    let has_text = false;

    if (!this.id) {
      this.id = this.app.wallet.computeNFTIdFromTx(tx);
    }

    this.txmsg = tx.returnMessage();

    this.data = this.txmsg?.data ?? {};

    if (typeof this.data.image !== 'undefined') {
      this.image = this.data.image;
      has_image = true;
      processed = true;
    }

    if (this.txmsg?.description && !this.description) {
      this.description = this.txmsg.description;
    }

    if (this.txmsg?.title && !this.title) {
      this.title = this.txmsg.title;
    }

    if (typeof this.data.css !== 'undefined') {
      has_css = true;
      this.css = this.data.css;
      processed = true;
    }

    if (typeof this.data.js !== 'undefined') {
      has_js = true;
      this.js = this.data.js;
      processed = true;
    }

    if (typeof this.data.text !== 'undefined') {
      has_text = true;
      this.text = this.data.text;
      processed = true;
    }

    if (Object.keys(this.data).length > 1) {
      if (has_image) {
        if (Object.keys(this.data).length > 2) {
          this.json = JSON.stringify(this.data, null, 2);
        }
      } else {
        this.json = JSON.stringify(this.data, null, 2);
      }
    }

    if (typeof this.data !== 'undefined' && processed == false) {
      this.json =
        typeof this.data === 'object' ? JSON.stringify(this.data, null, 2) : String(this.data);
      processed = true;
    }
  }

  extractSlipObject(slip) {
    if (slip == null) return {};

    let toStr = (v) => (typeof v === 'bigint' ? v.toString() : String(v));
    let toNum = (v) => (typeof v === 'number' ? v : Number(v ?? 0));

    return {
      amount: slip.amount, // Keep as BigInt
      block_id: toStr(slip.blockId),
      public_key: slip.publicKey,
      slip_index: toNum(slip.index),
      slip_type: toNum(slip.type),
      tx_ordinal: toStr(slip.txOrdinal),
      utxo_key: slip.utxoKey
    };
  }

  async setDeposit(saitoAmount) {
    if (saitoAmount == null) throw new Error('setPrice: amount is required');
    let saitoStr =
      typeof saitoAmount === 'bigint' ? saitoAmount.toString() : String(saitoAmount).trim();
    if (!saitoStr || isNaN(Number(saitoStr))) throw new Error('setPrice: invalid amount');
    let nolan = await this.app.wallet.convertSaitoToNolan(saitoStr);
    if (nolan == null) {
      throw new Error('setPrice: conversion failed');
    }
    this.deposit = BigInt(nolan);
    return this;
  }

  getDeposit() {
    return this.app.wallet.convertNolanToSaito(this.deposit);
  }

  //
  // count items for merge
  //
  getSlipCount() {
    let arr = this.app?.options?.wallet?.nfts || [];
    return arr.filter((n) => n?.id === this.id).length;
  }

  getTotalAmount() {
    let all_slips = this.returnAllSlips();
    let total_amount = 0;
    for (let z = 0; z < all_slips.length; z++) {
      total_amount += parseInt(all_slips[z].slip1.amount);
    }
    return total_amount;
  }

  returnAllSlips() {
    let nft_list = this.app.options.wallet.nfts;
    let all_slips = [];

    if (this.slip2.public_key !== this.mod.publicKey) {
      return [this];
    }

    for (let z = 0; z < nft_list.length; z++) {
      let n = nft_list[z];
      if (n.id == this.id) {
        all_slips.push(n);
      }
    }
    return all_slips;
  }

  returnType() {
    if (this.nft_type) {
      return this.nft_type;
    }
    if (this.slip3?.utxo_key) {
      this.nft_type = this.app.wallet.extractNFTType(this.slip3.utxo_key);
      if (this.nft_type) {
        return this.nft_type;
      }
    }
    const properties = ['image', 'text', 'json', 'js', 'css'];

    for (const prop of properties) {
      const value = this[prop];
      if (value && (typeof value !== 'string' || value.trim() !== '')) {
        this.nft_type = prop;
        return prop;
      }
    }
    return null;
  }

  returnCreator() {
    if (this.creator) {
      return this.creator;
    }

    // The creator is the public key on the NFT UTXO (slip1)
    if (this.slip1?.publicKey) {
      return this.slip1.public_key;
    }

    // Fallback: attempt extraction from utxo_key if available
    if (this.slip3?.utxo_key) {
      const nft = this.app.wallet.extractNFT(this.slip3.utxo_key);
      if (nft?.slip1?.public_key) {
        return nft.slip1.public_key;
      }
    }

    return null;
  }

  returnImage() {
    return this.image || '';
  }

  returnModuleMediaDisplay() {
    const nft_type =
      this.nft_type || (typeof this.returnType === 'function' ? this.returnType() : null);
    const handlers = this.app.modules.getRespondTos('saito-nft-media', this);

    for (const modobj of handlers) {
      if (!modobj?.class || !modobj.class.includes(nft_type) || !nft_type) {
        continue;
      }
      if (typeof modobj.returnMediaDisplay === 'function') {
        const display = modobj.returnMediaDisplay(this);
        if (display) {
          return display;
        }
      }
    }

    return null;
  }

  hasResolvableMedia() {
    if (this.returnImage()) {
      return true;
    }
    if (this.returnModuleMediaDisplay()) {
      return true;
    }
    return !!(this.js || this.css || this.text || this.json);
  }

  isMediaLoading() {
    return this.returnMediaDisplay().loading;
  }

  returnMediaDisplay() {
    const moduleDisplay = this.returnModuleMediaDisplay();
    if (moduleDisplay) {
      return {
        backgroundImage: moduleDisplay.backgroundImage || '',
        innerHtml: moduleDisplay.innerHtml || '',
        loading: false,
        failed: false
      };
    }

    if (this.image) {
      return {
        backgroundImage: this.image,
        innerHtml: '',
        loading: false,
        failed: false
      };
    }

    if (this.js) {
      return {
        backgroundImage: '',
        innerHtml: `<div class="saito-nft-card-text">${this.js}</div>`,
        loading: false,
        failed: false
      };
    }

    if (this.css) {
      return {
        backgroundImage: '',
        innerHtml: `<div class="saito-nft-card-text">${this.css}</div>`,
        loading: false,
        failed: false
      };
    }

    if (this.text) {
      return {
        backgroundImage: '',
        innerHtml: `<div class="saito-nft-card-text">${this.text}</div>`,
        loading: false,
        failed: false
      };
    }

    if (this.json) {
      return {
        backgroundImage: '',
        innerHtml: `<div class="saito-nft-card-text">${this.json}</div>`,
        loading: false,
        failed: false
      };
    }

    if (this.load_failed) {
      return {
        backgroundImage: '',
        innerHtml: '<i class="fa-solid fa-heart-crack"></i>',
        loading: false,
        failed: true
      };
    }

    return {
      backgroundImage: '',
      innerHtml: '',
      loading: true,
      failed: false
    };
  }
}

module.exports = SaitoNFT;
