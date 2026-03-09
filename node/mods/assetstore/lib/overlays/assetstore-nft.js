let SaitoNFT = require('./../../../../lib/saito/ui/saito-nft/saito-nft');
let Transaction = require('./../../../../lib/saito/transaction').default;

class AssetStoreNFT extends SaitoNFT {
  constructor(app, mod, tx = null, data = null) {
    super(app, mod, tx, data);

    //
    // potentially useful
    //
    this.seller = '';
    this.price = BigInt(0);
  }

  setSeller(public_key) {
    if (public_key) {
      this.seller = public_key;
    }
  }

  setPrice(saitoAmount) {
    if (saitoAmount == null) throw new Error('setPrice: amount is required');
    let saitoStr =
      typeof saitoAmount === 'bigint' ? saitoAmount.toString() : String(saitoAmount).trim();
    if (!saitoStr || isNaN(Number(saitoStr))) throw new Error('setPrice: invalid amount');
    let nolan = this.app.wallet.convertSaitoToNolan(saitoStr);
    if (nolan == null) throw new Error('setPrice: conversion failed');
    this.price = BigInt(nolan);
  }

  //
  // for transactions and calculations
  //
  getBuyPriceNolan() {
    return this.price ? this.price : this.deposit;
  }

  //
  // for UI
  //
  getBuyPriceSaito() {
    let saito_as_string = this.price
      ? this.app.wallet.convertNolanToSaito(this.price)
      : this.app.wallet.convertNolanToSaito(this.deposit);

    return BigInt(saito_as_string);
  }
}

module.exports = AssetStoreNFT;
