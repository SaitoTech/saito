const NFTAtomizeTemplate = require('./nft-atomize.template');
const SaitoNFT = require('./../saito-nft');

class NFTAtomize {

  constructor(app, mod, container, nft, utxoIdx) {

    this.app = app;
    this.mod = mod;

    this.container = container;

    this.nft = nft;
    this.utxoIdx = utxoIdx;

    //
    // Limits (should be injected from parent if needed)
    //
    this.MAX_NFT_ATOMIZE_PER_TX = 20;
    this.MAX_NFT_ATOMIZE_TOTAL = 100;
    this.MAX_NFT_ATOMIZE_TX_PER_BLOCK = 5;

    //
    // State
    //
    this.active = false;

    this.state = {
      nft_id: nft.id,
      initial_amount: Number(nft.slip1?.amount ?? nft.amount) || 0,
      pending: new Map(),
      inflight: new Set(),
      done: new Set(),
      tx_sent_this_cycle: 0
    };

    this.walletListener = this.onWalletUpdate.bind(this);
    this.reassuranceInterval = null;
  }


  render() {

    if (!this.state.initial_amount || this.state.initial_amount < 1) {
      console.error("NFTAtomize: invalid initial_amount", this.state.initial_amount);
      return;
    }
    if (this.state.initial_amount > this.MAX_NFT_ATOMIZE_TOTAL) {
      salert(
        `Atomization limit exceeded. Maximum allowed is ${this.MAX_NFT_ATOMIZE_TOTAL}.`
      );
      return;
    }

    //
    // Initialize pending and done from current wallet (read-only)
    //
    const nft_list = this.app.options.wallet.nfts || [];
    this.state.pending.clear();
    this.state.done.clear();
    this.state.inflight.clear();
    for (const slip of nft_list) {
      if (String(slip.id) !== String(this.state.nft_id)) continue;
      const key = slip.slip1?.utxo_key;
      if (!key) continue;
      const amt = Number(slip.slip1?.amount);
      if (amt > 1) this.state.pending.set(key, amt);
      else if (amt === 1) this.state.done.add(key);
    }

    //
    // Replace parent container content
    //
    this.app.browser.replaceElementBySelector(
      NFTAtomizeTemplate(
        this.utxoIdx,
        this.state.initial_amount
      ),
      this.container
    );

    this.active = true;

    //
    // Listen for wallet updates
    //
    this.app.connection.on(
      'saito-header-update-crypto',
      this.walletListener
    );

    //
    // Reassurance text rotation
    //
    this.reassuranceInterval = setInterval(() => {
      this.rotateStatusMessage();
    }, 8000);

    //
    // Close button just stops engine
    //
    const closeBtn = document.querySelector('.nft-atomize-stop');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.shutdown();
      };
    }

    //
    // Kick off first cycle
    //
    this.processStep();
  }


  shutdown() {

    if (!this.active) return;

    this.active = false;

    this.app.connection.removeListener(
      'saito-header-update-crypto',
      this.walletListener
    );

    if (this.reassuranceInterval) {
      clearInterval(this.reassuranceInterval);
    }
  }


  onWalletUpdate() {

console.log("into onWallet Update: " + this.active);

    if (!this.active) { return; }

    const nft_list = this.app.options.wallet.nfts || [];
    const walletKeys = new Set();
    for (const slip of nft_list) {
      if (String(slip.id) !== String(this.state.nft_id)) continue;
      const key = slip.slip1?.utxo_key;
      if (key) walletKeys.add(key);
    }

    for (const key of Array.from(this.state.inflight)) {
      if (!walletKeys.has(key)) this.state.inflight.delete(key);
    }

    for (const slip of nft_list) {
      if (String(slip.id) !== String(this.state.nft_id)) continue;
      const key = slip.slip1?.utxo_key;
      if (!key) continue;
      const amt = Number(slip.slip1?.amount);
      if (amt === 1) this.state.done.add(key);
      else if (amt > 1 && !this.state.inflight.has(key)) this.state.pending.set(key, amt);
    }

    this.state.tx_sent_this_cycle = 0;
    this.processStep();
  }


  processStep() {

    if (!this.active) return;

    this.updateProgressUI();

    if (this.state.pending.size === 0 && this.state.inflight.size === 0) {
      this.finish();
      return;
    }

    if (this.state.tx_sent_this_cycle >= this.MAX_NFT_ATOMIZE_TX_PER_BLOCK) {
      return;
    }

    if (this.state.pending.size === 0) return;

    const pendingEntries = Array.from(this.state.pending.entries());
    pendingEntries.sort((a, b) => b[1] - a[1]);
    const [utxoKey, amount] = pendingEntries[0];

    this.splitSlip(utxoKey, amount);
  }


  async splitSlip(utxoKey, amount) {

    try {

      this.state.pending.delete(utxoKey);
      this.state.inflight.add(utxoKey);

      const nft_list = this.app.options.wallet.nfts || [];
      const slip = nft_list.find((n) => n.slip1?.utxo_key === utxoKey);
      if (!slip) {
        this.state.inflight.delete(utxoKey);
        if (utxoKey.endsWith("_r")) this.state.pending.delete(utxoKey);
        else this.state.pending.set(utxoKey, amount);
        return;
      }

      let slipNFT = slip;
      if (typeof slipNFT.fetchTransaction !== "function") {
        slipNFT = new SaitoNFT(this.app, this.mod, null, slip, null);
      }

      const MAX = BigInt(this.MAX_NFT_ATOMIZE_PER_TX);
      const amt = BigInt(amount);

      if (amt <= MAX) {
        let tx = await this.app.wallet.createAtomizeNFTTransaction(slipNFT);
        await tx.sign();
        await this.app.network.propagateTransaction(tx);
        this.state.tx_sent_this_cycle++;
        // optimistic local state advance to prevent stall
        this.state.inflight.delete(utxoKey);
        this.state.done.add(utxoKey);
        this.processStep();
        return;
      }

      let tx = await this.app.wallet.createSplitNFTTransaction(
        slipNFT,
        Number(this.MAX_NFT_ATOMIZE_PER_TX),
        Number(amt - MAX)
      );
      await tx.sign();
      await this.app.network.propagateTransaction(tx);
      this.state.tx_sent_this_cycle++;
      // optimistic local state advance to prevent stall
      this.state.inflight.delete(utxoKey);
      const MAX_NUM = this.MAX_NFT_ATOMIZE_PER_TX;
      const remainder = amount - MAX_NUM;
      this.state.pending.set(utxoKey + "_r", remainder);
      this.state.done.add(utxoKey + "_c");
      this.processStep();

    } catch (err) {
      console.error("Atomize split failed:", err);
      this.state.inflight.delete(utxoKey);
      this.state.pending.set(utxoKey, amount);
    }
  }


  updateProgressUI() {

    const el = document.querySelector('.nft-atomize-progress');
    if (!el) return;

    el.innerText =
      `${this.state.done.size} / ${this.state.initial_amount}`;
  }


  rotateStatusMessage() {

    if (!this.active) return;

    const el = document.querySelector('.nft-atomize-status');
    if (!el) return;

    const messages = [
      "Waiting for network confirmation...",
      "Submitting split transactions...",
      "Processing NFT shards...",
      "Updating wallet state..."
    ];

    el.innerText =
      messages[Math.floor(Math.random() * messages.length)];
  }


  finish() {

    this.active = false;

    const statusEl =
      document.querySelector('.nft-atomize-status');

    if (statusEl) {
      statusEl.innerText = "Atomization complete.";
    }

    this.app.connection.removeListener(
      'saito-header-update-crypto',
      this.walletListener
    );

    if (this.reassuranceInterval) {
      clearInterval(this.reassuranceInterval);
    }
  }
}

module.exports = NFTAtomize;

