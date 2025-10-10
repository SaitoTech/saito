class SaitoNft {
  constructor(app, mod, tx = null, data = null, card = null) {
    this.app = app;
    this.mod = mod;

    //
    // nft details
    //
    this.id = data?.id;
    this.tx_sig = data?.tx_sig;
    this.slip1 = data?.slip1;
    this.slip2 = data?.slip2;
    this.slip3 = data?.slip3;

    //
    // tx details
    //
    this.tx = tx;
    this.txmsg = null;

    this.card = null; // nft card, if created by one

    this.amount = BigInt(0); // nolans
    this.deposit = BigInt(0); // nolans
    this.image = '';
    this.text = '';

    this.load_failed = false;

    //
    // UI helpers
    //
    this.uuid = null;
    this.tx_fetched = false;

    //
    // for auction
    //
    this.seller = '';
    this.ask_price = BigInt(0);

    if (this.slip1?.amount) {
      this.amount = BigInt(this.slip1.amount);
      this.uuid = this.slip1?.utxo_key;
    }

    if (this.slip2?.amount) {
      this.deposit = BigInt(this.slip2.amount);
    }

    if (tx != null) {
      this.buildNFTData();
    }
  }

  async fetchTransaction(callback = null) {
    if (!this.id) {
      console.error('0.5 Unable to fetch NFT transaction (no nft id found)');
      if (callback) {
        this.tx_fetched = false;
        return callback();
      }
    }

    if (this.tx && this.txmsg && (this.image || this.text)) {
      if (callback) {
        this.tx_fetched = false;
        return callback();
      }
    }

    await this.app.storage.loadTransactions(
      { field4: this.id },

      async (txs) => {
        if (txs?.length > 0) {
          this.tx = txs[0];
          this.buildNFTData();
          if (callback) {
            this.tx_fetched = true;
            return callback();
          }
        } else {
          //
          // try remote host (which **IS NOT** CURRENTLY INDEXING NFT TXS)
          //
          let peer = await this.app.network.getPeers();

          this.app.storage.loadTransactions(
            { field4: this.id },
            (txs) => {
              if (txs?.length > 0) {
                this.tx = txs[0];

                this.buildNFTData();

                //
                // save remotely fetched nft tx to local
                //
                this.app.storage.saveTransaction(this.tx, { field4: this.id }, 'localhost');

                if (callback) {
                  this.tx_fetched = true;
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

    this.tx_fetched = false;
    return null;
  }

  buildNFTData() {
    let this_self = this;

    if (!this.tx) {
      console.error('SaitoNFT object missing this.tx so cannot buildNFTData - ERROR');
      return;
    }

    if (this.tx) {
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
    }

    if (this.slip1?.amount) {
      this.amount = BigInt(this.slip1.amount);
      this.uuid = this.slip1?.utxo_key;
    }

    if (this.slip2?.amount) {
      this.deposit = BigInt(this.slip2.amount);
    }

    if (!this.id) {
      this.id = this.computeNftIdFromTx(this.tx);
    }
  }

  //
  // Extracts NFT image/text, tx_sig, txmsg data from a transaction
  //
  extractNFTData() {
    if (!this.tx) {
      return;
    }

    this.tx_sig = this.tx?.signature;
    this.txmsg = this.tx.returnMessage();
    this.id = this.computeNftIdFromTx(this.tx);

    this.data = this.txmsg?.data ?? {};

    if (typeof this.data.image !== 'undefined') {
      this.image = this.data.image;
    }

    if (typeof this.data.text !== 'undefined') {
      this.text =
        typeof this.data.text === 'object' && this.data.text !== null
          ? JSON.stringify(this.data.text, null, 2)
          : String(this.data.text);
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

  //
  // We need a way to get nft_id from NFT tx.
  //
  // If the NFT belongs to us we can simply get nft_id
  // from storage (app.options.wallet.nfts[i].id). But in cases
  // where NFT doesnt belong to us (e.g listed on assetstore) we
  // need to compute nft_id based on the NFT tx we have.
  //
  // This situation isnt unqiue to assetstore, other mods will be
  // creating NFT objects based on NFT tx so doesnt makes sense for this
  // method below to be placed in assetstore.
  //

  //
  // Ideal way would be to let rust comoute this by sending NFT tx
  // to rust. For now temporarily JS is handling this.
  //

  // Derive an NFT id from a tx
  computeNftIdFromTx(tx) {
    if (!tx) {
      return null;
    }

    // Prefer outputs; fall back to inputs
    let s3 = (tx?.to && tx.to[2]) || (tx?.from && tx.from[2]);
    if (!s3 || !s3.publicKey) return null;

    let pk = s3.publicKey;
    let bytes = null;

    // Normalize to Uint8Array
    if (pk instanceof Uint8Array || (typeof Buffer !== 'undefined' && pk instanceof Buffer)) {
      bytes = new Uint8Array(pk);
    } else if (typeof pk === 'string') {
      if (/^[0-9a-fA-F]{66}$/.test(pk)) {
        // Hex (33 bytes = 66 hex chars)
        bytes = this.hexToBytes(pk);
      } else {
        // Assume Base58 (Saito-style pubkey encoding)
        bytes = this.base58ToBytes(pk);
      }
    } else if (pk && typeof pk === 'object' && pk.data) {
      bytes = new Uint8Array(pk.data);
    }

    if (!bytes) return null;

    // Some encoders may prepend a 0x00; tolerate 34→33
    if (bytes.length === 34 && bytes[0] === 0) bytes = bytes.slice(1);
    if (bytes.length !== 33) return null;

    // Return as hex string
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  hexToBytes(hex) {
    let clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    let out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  base58ToBytes(str) {
    // Bitcoin Base58 alphabet
    let B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let B58_MAP = (() => {
      let m = new Map();
      for (let i = 0; i < B58_ALPHABET.length; i++) m.set(B58_ALPHABET[i], i);
      return m;
    })();

    // Count leading zeros
    let zeros = 0;
    while (zeros < str.length && str[zeros] === '1') zeros++;

    // Base58 decode to a big integer in bytes (base256)
    let bytes = [];
    for (let i = zeros; i < str.length; i++) {
      let val = B58_MAP.get(str[i]);
      if (val == null) throw new Error('Invalid Base58 character');
      let carry = val;
      for (let j = 0; j < bytes.length; j++) {
        let x = bytes[j] * 58 + carry;
        bytes[j] = x & 0xff;
        carry = x >> 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }

    // Add leading zeros
    for (let k = 0; k < zeros; k++) bytes.push(0);

    // Output is little-endian; reverse to big-endian
    bytes.reverse();
    return new Uint8Array(bytes);
  }

  async setAskPrice(saitoAmount) {
    if (saitoAmount == null) throw new Error('setPrice: amount is required');
    let saitoStr =
      typeof saitoAmount === 'bigint' ? saitoAmount.toString() : String(saitoAmount).trim();
    if (!saitoStr || isNaN(Number(saitoStr))) throw new Error('setPrice: invalid amount');
    let nolan = await this.app.wallet.convertSaitoToNolan(saitoStr);
    if (nolan == null) throw new Error('setPrice: conversion failed');
    this.ask_price = BigInt(nolan);
    return this;
  }

  async getAskPrice() {
    return await this.app.wallet.convertNolanToSaito(this.ask_price);
  }

  async setPrice(saitoAmount) {
    if (saitoAmount == null) throw new Error('setPrice: amount is required');
    let saitoStr =
      typeof saitoAmount === 'bigint' ? saitoAmount.toString() : String(saitoAmount).trim();
    if (!saitoStr || isNaN(Number(saitoStr))) throw new Error('setPrice: invalid amount');
    let nolan = await this.app.wallet.convertSaitoToNolan(saitoStr);
    if (nolan == null) throw new Error('setPrice: conversion failed');
    this.deposit = BigInt(nolan);
    return this;
  }

  async getPrice() {
    return await this.app.wallet.convertNolanToSaito(this.deposit);
  }

  async setSeller(public_key) {
    if (public_key) {
      this.seller = public_key;
    }
  }

  async getSeller() {
    return this.seller;
  }

  //
  // for transactions and calculations
  //
  getBuyPriceNolan() {
    return this.ask_price ? this.ask_price : this.deposit;
  }

  //
  // for UI
  //
  getBuyPriceSaito() {
    return this.ask_price
      ? this.app.wallet.convertNolanToSaito(this.ask_price)
      : this.app.wallet.convertNolanToSaito(this.deposit);
  }
}

module.exports = SaitoNft;
