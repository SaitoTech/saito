/*********************************************************************************

 NFT CRYPTO MODULE

 Treats a single NFT (by nft_id) as a CryptoModule so it can be:
  - displayed in the wallet
  - selected as a payment asset
  - transferred fractionally
  - staked / wagered by games

 One instance == one NFT id (aggregates all owned slips)

**********************************************************************************/

const CryptoModule = require('./cryptomodule');
const SaitoNFT = require('../saito/ui/saito-nft/saito-nft');

// Mirror saito-js enums so this file loads without bundler resolution (TransactionType.Bound = 8, SlipType.Bound = 9).
const TX_TYPE_BOUND = 8;
const SLIP_BOUND = 9;
const SLIP_NORMAL = 0;
const SLIP_ATR = 1;

/**
 * Bound NFT input triple: slip[i] and slip[i+2] are Bound; slip[i+1] is Normal or ATR.
 * Matches rust `Transaction::is_nft`.
 */
function isNftInputTriple(slips, i) {
  if (!slips || i + 2 >= slips.length) {
    return false;
  }
  const a = slips[i];
  const b = slips[i + 1];
  const c = slips[i + 2];
  return (
    a?.type === SLIP_BOUND &&
    c?.type === SLIP_BOUND &&
    (b?.type === SLIP_NORMAL || b?.type === SLIP_ATR)
  );
}

class NFTCryptoModule extends CryptoModule {
  constructor(app, nft_id, opts = {}) {
    // ticker must be unique per NFT
    const ticker = opts.ticker || `NFT-${app.crypto.hash(nft_id).slice(0, 6)}`;

    super(app, ticker);

    this.name = opts.name || ticker;
    this.description = opts.description || 'NFT Asset';
    this.categories = 'NFT';

    // NFT identity
    this.nft_id = nft_id;

    // Optional explicit image (e.g. injected when mint tx is already loaded)
    this._nft_logo_opt =
      typeof opts.image === 'string' && opts.image.trim() ? opts.image.trim() : '';

    //
    // Cached logos for header / crypto UI: thumb keeps memory and decode cost down
    //
    this._nft_logo_thumb = null;
    this._nft_logo_full = null;
    this._nft_logo_refresh_promise = null;

    // NFTs are local UTXO assets
    this.confirmations = 0;
    this.warning = '';
    this.introduction = '';

    // NFTs do not have external addresses
    this.address = this.app.wallet.publicKey;

    // It is easier to flag native cryptos than web3 (especially if we add some outside mixin)
    // Also applies to ghost Saito module in wallet.ts
    this.chain_id = 'NATIVE';

    // History is intentionally unsupported
    this.history = null;
    this.history_update_ts = 0;

    // Mark as activated immediately
    this.options.isActivated = true;
  }

  /**
   * Load balance/options from disk, then resolve NFT artwork for returnLogos().
   */
  async initialize(app) {
    await super.initialize(app);
    this.refreshNFTLogoCache().catch((err) => {
      console.warn('NFTCryptoModule: refreshNFTLogoCache failed', err?.message || err);
    });
  }

  /**
   * Best-effort: pull image from wallet row, mint tx (via SaitoNFT), optional downscale for UI.
   * Safe to call repeatedly; concurrent calls share one in-flight refresh.
   */
  async refreshNFTLogoCache() {
    if (this._nft_logo_refresh_promise) {
      return this._nft_logo_refresh_promise;
    }
    this._nft_logo_refresh_promise = this._refreshNFTLogoCacheBody().finally(() => {
      this._nft_logo_refresh_promise = null;
    });
    return this._nft_logo_refresh_promise;
  }

  async _refreshNFTLogoCacheBody() {
    const prevThumb = this._nft_logo_thumb;
    const prevFull = this._nft_logo_full;

    let full = this._nft_logo_opt || '';
    if (!full) {
      full = this._inlineImageFromWalletRow(this._returnSampleWalletNFT());
    }

    if (!full) {
      const row = this._returnSampleWalletNFT();
      if (row) {
        full = await this._fetchNftMintImageFromArchive(row);
      }
    }

    if (!full) {
      this._nft_logo_thumb = null;
      this._nft_logo_full = null;
      if ((prevThumb || prevFull) && this.app?.connection) {
        this.app.connection.emit('saito-header-update-crypto');
      }
      return;
    }

    this._nft_logo_full = full;
    this._nft_logo_thumb = await this._maybeDownscaleLogoForCache(full);

    if (prevThumb !== this._nft_logo_thumb || prevFull !== this._nft_logo_full) {
      if (this.app?.connection) {
        this.app.connection.emit('saito-header-update-crypto');
      }
    }
  }

  _returnSampleWalletNFT() {
    const list = this.app?.options?.wallet?.nfts;
    if (!Array.isArray(list)) {
      return null;
    }
    return list.find((n) => n && n.id === this.nft_id) || null;
  }

  /**
   * Read mint tx from local archive (same search strategy as SaitoNFT) and return data.image.
   * Uses a sync load callback so await storage.loadTransactions sees the parsed result.
   */
  async _fetchNftMintImageFromArchive(row) {
    if (!row?.id || !this.app?.storage?.loadTransactions) {
      return '';
    }

    const pickImage = (txs) => {
      if (!txs?.length) {
        return '';
      }
      try {
        const txmsg = txs[0].returnMessage();
        const im = txmsg?.data?.image;
        return typeof im === 'string' && im.trim() ? im.trim() : '';
      } catch (err) {
        return '';
      }
    };

    const load = async (cond) => {
      try {
        const out = await this.app.storage.loadTransactions(
          cond,
          (txs) => pickImage(txs),
          'localhost'
        );
        return typeof out === 'string' && out ? out : '';
      } catch (err) {
        return '';
      }
    };

    const cond1 = row.tx_sig ? { sig: row.tx_sig } : { field4: row.id };
    let im = await load(cond1);
    if (im) {
      return im;
    }
    if (row.tx_sig) {
      im = await load({ field4: row.id });
    }
    return im || '';
  }

  _inlineImageFromWalletRow(row) {
    if (!row || typeof row !== 'object') {
      return '';
    }
    if (typeof row.image === 'string' && row.image.trim()) {
      return row.image.trim();
    }
    if (row.data && typeof row.data.image === 'string' && row.data.image.trim()) {
      return row.data.image.trim();
    }
    if (
      row.txmsg?.data &&
      typeof row.txmsg.data.image === 'string' &&
      row.txmsg.data.image.trim()
    ) {
      return row.txmsg.data.image.trim();
    }
    return '';
  }

  /**
   * For large raster data URLs, draw to a small canvas and keep a JPEG in memory for the header.
   * Skips http(s) sources (canvas taint) and small payloads.
   */
  _maybeDownscaleLogoForCache(src) {
    return new Promise((resolve) => {
      if (!src || typeof src !== 'string') {
        resolve(src);
        return;
      }
      if (!this.app?.BROWSER || typeof document === 'undefined' || typeof Image === 'undefined') {
        resolve(src);
        return;
      }
      const lower = src.slice(0, 11).toLowerCase();
      if (!lower.startsWith('data:image')) {
        resolve(src);
        return;
      }
      const maxBytes = 48 * 1024;
      if (src.length <= maxBytes) {
        resolve(src);
        return;
      }

      const img = new Image();
      const done = (out) => resolve(out || src);

      img.onload = () => {
        try {
          const maxDim = 144;
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) {
            done(src);
            return;
          }
          const scale = Math.min(1, maxDim / Math.max(w, h));
          const tw = Math.max(1, Math.round(w * scale));
          const th = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = tw;
          canvas.height = th;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            done(src);
            return;
          }
          ctx.drawImage(img, 0, 0, tw, th);
          const jpeg = canvas.toDataURL('image/jpeg', 0.72);
          done(jpeg && jpeg.length < src.length ? jpeg : src);
        } catch (err) {
          done(src);
        }
      };
      img.onerror = () => done(src);
      img.src = src;
    });
  }

  returnLogos() {
    const img = this._nft_logo_thumb || this._nft_logo_full;
    if (img) {
      return {
        img,
        alt_img: this._nft_logo_full || img
      };
    }
    if (this.app?.BROWSER) {
      this.refreshNFTLogoCache().catch(() => {});
    }
    return super.returnLogos();
  }

  /********************************************************
   * REQUIRED CRYPTOMODULE INTERFACE
   ********************************************************/

  /**
   * Internal helper to collect NFT slips from wallet options
   */
  _returnNFTSlips(opts = {}) {
    const { unreserved = false, state = 'unspent', limit = null } = opts;

    if (!this.app?.options?.wallet?.nfts) {
      return [];
    }

    let slips = this.app.options.wallet.nfts.filter((n) => n.id === this.nft_id);

    if (unreserved) {
      slips = slips.filter((s) => !s.reserved);
    }

    if (state === 'unspent') {
      slips = slips.filter((s) => !s.spent);
    }

    if (limit) {
      slips = slips.slice(0, limit);
    }

    return slips;
  }

  async getAvailableBalance() {
    return await this.fetchBalance();
  }

  async getPendingBalance() {
    const confirmedStr = await this.fetchBalance();
    let confirmed = 0n;
    try {
      confirmed = BigInt(String(confirmedStr || '0'));
    } catch (e) {
      confirmed = 0n;
    }

    let outgoing = 0n;
    try {
      const txs = await this.app.wallet.getPendingTxs();
      const myPk = this.app.wallet.publicKey;

      for (const tx of txs) {
        if (tx.type !== TX_TYPE_BOUND) {
          continue;
        }
        if (typeof tx.isFrom === 'function' && !tx.isFrom(myPk)) {
          continue;
        }

        const from = tx.from || [];
        for (let i = 0; i + 2 < from.length; ) {
          if (!isNftInputTriple(from, i)) {
            i++;
            continue;
          }
          const tripleId = this.app.wallet.computeNFTIdFromTx({
            to: [from[i], from[i + 1], from[i + 2]],
            from: []
          });
          if (tripleId === this.nft_id) {
            try {
              const raw = from[i].amount;
              outgoing += BigInt(typeof raw === 'bigint' ? raw : String(raw));
            } catch (e) {}
          }
          i += 3;
        }
      }
    } catch (e) {
      console.warn('NFTCryptoModule getPendingBalance:', e);
    }

    const pending = confirmed >= outgoing ? confirmed - outgoing : 0n;
    return pending.toString();
  }

  async fetchBalance() {
    // Sum all unreserved slips for this NFT id
    const slips = this._returnNFTSlips({ unreserved: true });

    let total = BigInt(0);

    for (let s of slips) {
      try {
        const raw = s?.amount ?? s?.slip1?.amount ?? 0;
        total += BigInt(typeof raw === 'bigint' ? raw : String(raw));
      } catch (err) {}
    }

    // CryptoModule expects a string
    this.balance = total.toString();
    return this.balance;
  }

  returnBalance() {
    return this.balance || '0';
  }

  returnAddress() {
    // NFTs are sent to public keys, not external addresses
    return this.app.wallet.publicKey;
  }

  formatAddress() {
    return this.returnAddress();
  }

  returnPrivateKey() {
    // NFTs are controlled by the wallet key
    return this.app.wallet.returnPrivateKey();
  }

  async sendPayment(amount = '', recipient = '', unique_hash = '') {
    if (!amount || BigInt(amount) <= 0n) {
      throw new Error('NFTCryptoModule: invalid amount');
    }

    // Defensive recipient handling
    if (!recipient || typeof recipient !== 'string') {
      recipient = this.app.wallet.publicKey;
    } else {
      recipient = recipient.trim();

      // If wallet has validation function, use it safely
      if (this.app.crypto.isPublicKey && typeof this.app.crypto.isPublicKey === 'function') {
        if (!this.app.crypto.isPublicKey(recipient)) {
          recipient = this.app.wallet.publicKey;
        }
      } else {
        // Fallback heuristic: require reasonable length
        if (recipient.length < 20) {
          recipient = this.app.wallet.publicKey;
        }
      }
    }

    const row = this._returnSampleWalletNFT();
    if (!row || !row.id) {
      throw new Error('NFTCryptoModule: NFT not found in wallet');
    }

    const nft = new SaitoNFT(this.app, null, null, row);
    const amountInt = Number.parseInt(String(amount), 10);
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      throw new Error('NFTCryptoModule: invalid amount');
    }

    const tx_msg = JSON.parse(JSON.stringify(nft.txmsg || {}));
    let newtx = await this.app.wallet.createNFTTransaction(
      nft,
      recipient,
      amountInt,
      BigInt(0),
      BigInt(0),
      tx_msg
    );

    if (!newtx) {
      throw new Error('NFTCryptoModule: unable to construct NFT transfer');
    }

    newtx = await nft.modifyBeforeSend(newtx, recipient);
    if (!newtx) {
      throw new Error('NFTCryptoModule: transfer blocked by module.');
    }

    await newtx.sign();
    await this.app.network.propagateTransaction(newtx);

    return unique_hash || newtx.signature;
  }

  async receivePayment(amount = '', sender = '', recipient = '', timestamp = 0, unique_hash = '') {
    // NFT receipt is handled by wallet UTXO processing
    // We simply return success
    return true;
  }

  //
  // Legacy CryptoModule "crypto payment" channel (Saito notification txs for web3).
  // NFT liquidity uses bound/NFT txs only; these stubs avoid accidental handling.
  //

  async onConfirmation(blk, tx, conf) {
    return 0;
  }

  async sendPaymentTransaction(publicKey, from_address, to_address, amount, hash, memo = '') {}

  onReceivePayment(tx) {}

  /********************************************************
   * OPTIONAL / OVERRIDDEN BEHAVIOR
   ********************************************************/

  async fetchHistory(ts = null, callback = null) {
    // Explicitly unsupported for NFTs
    if (callback) {
      callback([]);
    }
  }

  async fetchPendingDeposits(callback = null) {
    if (callback) {
      callback([]);
    }
    return [];
  }

  validateAddress(address) {
    return this.app.crypto.isPublicKey(address);
  }

  async returnUtxo(state = 'unspent', limit = 1000, order = 'DESC') {
    return this._returnNFTSlips({ state, limit });
  }
}

module.exports = NFTCryptoModule;
