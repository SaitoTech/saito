class SaitoNFT {
  constructor(app, mod, tx = null, data = null) {
    this.app = app;
    this.mod = mod;

    //
    // nft details from app.options.wallet
    //
    this.id = data?.id;
    this.tx_sig = data?.tx_sig;
    this.slip1 = data?.slip1;
    this.slip2 = data?.slip2;
    this.slip3 = data?.slip3;

    //
    // and/or general meta data
    //
    this.metadata = data;
    this.title = data?.title || '';
    this.description = data?.description || '';

    this.creator = '';
    if (this.slip1?.public_key) {
      this.creator = this.slip1.public_key;
    }

    //
    // tx details
    //
    this.tx = tx;
    this.txmsg = null;

    this.amount = BigInt(0); // nolans
    this.deposit = BigInt(0); // nolans
    this.image = '';
    this.text = '';
    this.json = '';
    this.js = '';
    this.css = '';
    this.nft_type = '';

    this.load_failed = false;

    //
    // UI helpers
    //
    this.uuid = null;
    this.tx_fetched = false;

    if (this.slip1?.amount) {
      this.amount = BigInt(this.slip1.amount);
      this.uuid = this.slip1?.utxo_key;
    }

    if (this.slip2?.amount) {
      this.deposit = BigInt(this.slip2.amount);
    }

    if (this.slip3?.utxo_key) {
      this.nft_type = this.app.wallet.extractNFTType(this.slip3.utxo_key);
    }

    if (tx != null) {
      this.buildNFTData();
    }
  }

  async fetchTransaction(callback = null, localhost_only = false) {
    if (!this.id) {
      console.error('0.5 Unable to fetch NFT transaction (no nft id found)');
      if (callback) {
        callback();
      }
      return;
    }

    this.tx_fetched = true;

    // If we already have the transaction AND the image/data, we're done
    if (this.tx && this.txmsg && (this.image || this.text || this.js || this.css || this.json)) {
      console.debug('NFT already has all data');
      if (callback) {
        callback();
      }
      return;
    }

    // If we have the transaction but no image/data, try to extract it
    if (this.tx != null) {
      console.debug('Building nft data from transaction');
      this.buildNFTData();
      if (callback) {
        callback();
      }
      return;
    }

    console.debug('Fetching nft transaction from archive');
    await this.app.storage.loadTransactions(
      { field4: this.id },

      async (txs) => {
        if (txs?.length > 0) {
          console.debug('local archive returned nft');
          if (!this.tx) {
            this.tx = txs[0];
          }
          this.buildNFTData();
          if (callback) {
            return callback();
          }
        } else {
          if (localhost_only) {
            return null;
          }
          console.debug('trying remote archive for nft');

          //
          // try remote host (ours IS **NOT** CURRENTLY INDEXING NFT TXS)
          //
          let peer = await this.app.network.getPeers();

          this.app.storage.loadTransactions(
            { field4: this.id },
            (txs) => {
              if (txs?.length > 0) {
                console.debug('remote archive returned nft');
                if (!this.tx) {
                  this.tx = txs[0];
                }
                this.buildNFTData();

                //
                // save remotely fetched nft tx to local
                ////////////////////////////////////////////////
                ////////  See note in wallet.ts ////////////////
                ////////////////////////////////////////////////
                this.app.storage.saveTransaction(
                  this.tx,
                  { field4: this.id, preserve: 1 },
                  'localhost'
                );

                if (callback) {
                  return callback();
                }
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

  buildNFTData() {
    let this_self = this;

    if (!this.tx) {
      console.log('SaitoNFT has not yet loaded this.tx... skipping analysis for now');
      return;
    }

    //
    // tx is available we can extract slips & txmsg data (img/text)
    //
    this.extractNFTData();

    //
    // ovveride only if value already not set
    //
    this.slip1 ??= this.extractSlipObject(this.tx?.to?.[0] ?? null);
    this.slip2 ??= this.extractSlipObject(this.tx?.to[1] ?? null);
    this.slip3 ??= this.extractSlipObject(this.tx?.to[2] ?? null);

    if (this.slip1?.public_key) {
      this.creator = this.slip1.public_key;
    }

    if (this.slip1?.amount) {
      this.amount = BigInt(this.slip1.amount);
      this.uuid = this.slip1?.utxo_key;
    }

    if (this.slip2?.amount) {
      this.deposit = BigInt(this.slip2.amount);
    }
  }

  //
  // Extracts NFT image/text, tx_sig, txmsg data from a transaction
  //
  extractNFTData() {
    if (!this.tx) {
      return;
    }

    let processed = false;
    let has_image = false;
    let has_css = false;
    let has_js = false;
    let has_text = false;

    // Store the old tx_sig before updating
    let old_tx_sig = this.tx_sig;

    // Update to new signature
    this.tx_sig = this.tx?.signature;

    //
    // If signature changed and we're in a browser, update the DOM element's class
    //
    if (this.app.BROWSER && old_tx_sig && this.tx_sig && old_tx_sig !== this.tx_sig) {
      if (
        document.querySelector(`.nfttxsig${old_tx_sig}`) &&
        !document.querySelector(`.nfttxsig${this.tx_sig}`)
      ) {
        console.warn('Updating nft tx selectors...');
        document.querySelectorAll(`.nfttxsig${old_tx_sig}`).forEach((el) => {
          // Old element exists but new one doesn't - swap the class
          el.classList.remove(`nfttxsig${old_tx_sig}`);
          el.classList.add(`nfttxsig${this.tx_sig}`);
        });
      }
    }

    this.txmsg = this.tx.returnMessage();

    if (!this.id) {
      this.id = this.app.wallet.computeNFTIdFromTx(this.tx);
    }

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
      amount: toStr(slip.amount),
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

  returnAllSlips() {
    let nft_list = this.app.options.wallet.nfts;
    let all_slips = [];
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
      return this.app.wallet.extractNFTType(this.slip3.utxo_key);
    }
    const properties = ['image', 'text', 'json', 'js', 'css'];
    for (const prop of properties) {
      const value = this[prop];
      if (value && (typeof value !== 'string' || value.trim() !== '')) {
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
      return this.slip1.publicKey;
    }

    // Fallback: attempt extraction from utxo_key if available
    if (this.slip3?.utxo_key) {
      const nft = this.app.wallet.extractNFT(this.slip3.utxo_key);
      if (nft?.slip1?.publicKey) {
        return nft.slip1.publicKey;
      }
    }

    return null;
  }
}

module.exports = SaitoNFT;
