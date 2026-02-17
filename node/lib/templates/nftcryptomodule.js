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

class NFTCryptoModule extends CryptoModule {
  constructor(app, nft_id, opts = {}) {
    // ticker must be unique per NFT
    const ticker = opts.ticker || `NFT-${nft_id.slice(0, 6)}`;

    super(app, ticker);

    this.name = opts.name || ticker;
    this.description = opts.description || 'NFT Asset';
    this.categories = 'NFT';

    // NFT identity
    this.nft_id = nft_id;

    // NFTs are local UTXO assets
    this.confirmations = 0;
    this.warning = '';
    this.introduction = '';

    // NFTs do not have external addresses
    this.address = this.app.wallet.publicKey;

    // History is intentionally unsupported
    this.history = null;
    this.history_update_ts = 0;

    // Mark as activated immediately
    this.options.isActivated = true;
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

  async checkBalance() {
    // Sum all unreserved slips for this NFT id
    const slips = this._returnNFTSlips({ unreserved: true });

    let total = BigInt(0);

    for (let s of slips) {
      try {
        total += BigInt(s.amount);
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
      if (
        this.app.wallet.isValidPublicKey &&
        typeof this.app.wallet.isValidPublicKey === 'function'
      ) {
        if (!this.app.wallet.isValidPublicKey(recipient)) {
          recipient = this.app.wallet.publicKey;
        }
      } else {
        // Fallback heuristic: require reasonable length
        if (recipient.length < 20) {
          recipient = this.app.wallet.publicKey;
        }
      }
    }

    // Construct NFT transfer transaction
    const tx = await this.app.wallet.createNFTTransferTransaction(
      this.nft_id,
      BigInt(amount),
      recipient
    );

    if (!tx) {
      throw new Error('NFTCryptoModule: unable to construct NFT transfer');
    }

    await tx.sign();
    await this.app.network.propagateTransaction(tx);

    return unique_hash || tx.signature;
  }

  async receivePayment(amount = '', sender = '', recipient = '', timestamp = 0, unique_hash = '') {
    // NFT receipt is handled by wallet UTXO processing
    // We simply return success
    return true;
  }

  /********************************************************
   * OPTIONAL / OVERRIDDEN BEHAVIOR
   ********************************************************/

  async checkHistory(callback = null) {
    // Explicitly unsupported for NFTs
    if (callback) {
      callback([]);
    }
    return [];
  }

  async fetchPendingDeposits(callback = null) {
    if (callback) {
      callback([]);
    }
    return [];
  }

  validateAddress(address) {
    return this.app.wallet.isValidPublicKey(address);
  }

  async returnUtxo(state = 'unspent', limit = 1000, order = 'DESC') {
    return this._returnNFTSlips({ state, limit });
  }

  async returnNetworkInfo() {
    return { confirmations: 0 };
  }
}

module.exports = NFTCryptoModule;
