const NftCreate = require('./overlays/create-overlay');
const NftDisplay = require('./overlays/list-overlay');
const NftDetails = require('./overlays/nft-overlay');
const UIModTemplate = require('./../../../templates/uimodtemplate');

/*
  This is a container for all the independent overlays for displaying, creating, sending NFTs in Saito
*/
class SaitoNFT extends UIModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'SaitoNFT';

    //'saito-nft-create-render-request'
    this.create = new NftCreate(app, this);

    //'saito-nft-list-render-request'
    this.display = new NftDisplay(app, this);

    //'saito-nft-details-render-request'
    this.details = new NftDetails(app, this);
  }

  shouldAffixCallbackToModule() {
    return 1;
  }

  /***
   *
   * We can monitor all incoming txs on lite-blocks to see if they are nfts
   *
   */
  async onConfirmation(blk, tx, conf) {
    if (Number(conf) == 0) {
      let txmsg = tx.returnMessage();

      if (txmsg.module == 'NFT') {
        console.log(`UI Component SaitoNFT sees a NFT-marked transaction in Block ${blk.id}!!!`);
        console.log(txmsg);
      }
    }
  }

  // Derive an NFT id from a tx
  computeNftIdFromTx(tx) {
    if (!tx) return null;

    // Prefer outputs; fall back to inputs
    const s3 = (tx?.to && tx.to[2]) || (tx?.from && tx.from[2]);
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

  /* Helpers */

  hexToBytes(hex) {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  base58ToBytes(str) {
    // Bitcoin Base58 alphabet
    const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const B58_MAP = (() => {
      const m = new Map();
      for (let i = 0; i < B58_ALPHABET.length; i++) m.set(B58_ALPHABET[i], i);
      return m;
    })();

    // Count leading zeros
    let zeros = 0;
    while (zeros < str.length && str[zeros] === '1') zeros++;

    // Base58 decode to a big integer in bytes (base256)
    const bytes = [];
    for (let i = zeros; i < str.length; i++) {
      const val = B58_MAP.get(str[i]);
      if (val == null) throw new Error('Invalid Base58 character');
      let carry = val;
      for (let j = 0; j < bytes.length; j++) {
        const x = bytes[j] * 58 + carry;
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
}

module.exports = SaitoNFT;
