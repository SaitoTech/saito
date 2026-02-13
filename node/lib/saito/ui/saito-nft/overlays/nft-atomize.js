const NFTAtomizeTemplate = require('./nft-atomize.template');
const SaitoNFT = require('./../saito-nft');

//
// Status messages: state-driven, network-aware sequence
//
const STATUS = {
  ANALYZING: "analyzing NFT state…",
  PREPARING: "preparing split transaction…",
  SIGNING: "signing transaction…",
  BROADCASTING: "broadcasting transaction to network…",
  AWAITING: "transaction broadcast. awaiting confirmation…",
  WAITING_BLOCK: "waiting for next block…",
  STILL_AWAITING: "still awaiting confirmation…",
  FINALIZING: "network is finalizing your transaction…",
  MONITORING: "block times can vary. monitoring confirmation…",
  CONFIRMED: "confirmed in block.",
  COMPLETE: "atomization complete."
};

const CONFIRMATION_ESCALATION_MS = 15000;
const WAITING_PHASE_MESSAGES = [
  STATUS.WAITING_BLOCK,
  STATUS.STILL_AWAITING,
  STATUS.FINALIZING,
  STATUS.MONITORING
];

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
    this.currentStatus = "";
    this.confirmationEscalationTicks = 0;
  }


  setStatus(msg) {
    if (this.currentStatus === msg) return;
    this.currentStatus = msg;
    const el = document.querySelector('.nft-atomize-status');
    if (el) el.innerText = msg;
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
    // No Way Home
    //
    document.querySelector('.saito-nft-header-btn')?.remove();


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
    this.setStatus(STATUS.ANALYZING);

    //
    // Listen for wallet updates
    //
    this.app.connection.on(
      'saito-header-update-crypto',
      this.walletListener
    );

    //
    // Confirmation-waiting escalation: advance message every N seconds while awaiting confirmation
    //
    this.reassuranceInterval = setInterval(() => {
      if (!this.active) return;
      if (this.currentStatus !== STATUS.AWAITING && !WAITING_PHASE_MESSAGES.includes(this.currentStatus)) return;
      this.confirmationEscalationTicks++;
      const idx = Math.min(this.confirmationEscalationTicks, WAITING_PHASE_MESSAGES.length - 1);
      this.setStatus(WAITING_PHASE_MESSAGES[idx]);
    }, CONFIRMATION_ESCALATION_MS);

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

    if (!this.active) { return; }

    //
    // Rebuild pending and done from current wallet state only.
    // Progress and completion are derived from wallet (confirmation), not from send.
    //
    const nft_list = this.app.options.wallet.nfts || [];
    this.state.pending.clear();
    this.state.done.clear();
    for (const slip of nft_list) {
      if (String(slip.id) !== String(this.state.nft_id)) continue;
      const key = slip.slip1?.utxo_key;
      if (!key) continue;
      const amt = Number(slip.slip1?.amount);
      if (amt > 1) this.state.pending.set(key, amt);
      else if (amt === 1) this.state.done.add(key);
    }
    for (const key of this.state.done) this.state.inflight.delete(key);

    this.state.tx_sent_this_cycle = 0;
    this.processStep();
  }


  processStep() {

    if (!this.active) return;

    this.updateProgressUI();

    if (this.state.done.size >= this.state.initial_amount) {
      this.finish();
      return;
    }

    if (this.state.tx_sent_this_cycle >= this.MAX_NFT_ATOMIZE_TX_PER_BLOCK) {
      return;
    }

    const pendingEntries = Array.from(this.state.pending.entries())
      .filter(([key]) => !this.state.inflight.has(key));
    if (pendingEntries.length === 0) return;

    pendingEntries.sort((a, b) => b[1] - a[1]);
    const [utxoKey, amount] = pendingEntries[0];

    this.setStatus(STATUS.PREPARING);
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
        this.setStatus(STATUS.SIGNING);
        let tx = await this.app.wallet.createAtomizeNFTTransaction(slipNFT);
        await tx.sign();
        this.setStatus(STATUS.BROADCASTING);
        await this.app.network.propagateTransaction(tx);
        this.state.tx_sent_this_cycle++;
        this.confirmationEscalationTicks = 0;
        this.setStatus(STATUS.AWAITING);
        return;
      }

      this.setStatus(STATUS.SIGNING);
      let tx = await this.app.wallet.createSplitNFTTransaction(
        slipNFT,
        Number(this.MAX_NFT_ATOMIZE_PER_TX),
        Number(amt - MAX)
      );
      await tx.sign();
      this.setStatus(STATUS.BROADCASTING);
      await this.app.network.propagateTransaction(tx);
      this.state.tx_sent_this_cycle++;
      this.confirmationEscalationTicks = 0;
      this.setStatus(STATUS.AWAITING);
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


  finish() {

    this.active = false;

    const containerEl = document.querySelector(this.container);
    if (containerEl) {
      const leftBox = containerEl.querySelector('.split-number-box');
      if (leftBox) {
        leftBox.innerHTML = String(this.state.initial_amount);
      }
    }

    this.setStatus(STATUS.CONFIRMED);
    setTimeout(() => {
      this.setStatus(STATUS.COMPLETE);
    }, 800);

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

