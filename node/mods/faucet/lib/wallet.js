/**
 * Poor-man's Faucet wallet. Keys in app.options.faucet.
 * slips[] are rebuilt from getBalanceSnapshot; the chain is the source of truth.
 *
 * WASM Transaction.sign() always signs with the node wallet key. Faucet
 * signs the canonical WASM hash_for_signature with the Faucet private key.
 */

const Transaction = require('../../../lib/saito/transaction').default;
const Slip = require('../../../lib/saito/slip').default;

function outputIndexes(tx) {
  return (tx.to || []).map((slip) => Number(slip.index));
}

function slipTotal(slips = []) {
  let total = 0n;
  for (const slip of slips) {
    try {
      total += BigInt(slip.amount || 0);
    } catch (err) {
      // ignore malformed slip amounts
    }
  }
  return total;
}

class FaucetWallet {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.queue = [];
    this.slips = [];
    this.publickey = '';
    this.halted = false;
  }

  async initialize() {
    if (this.app.BROWSER) {
      return;
    }

    if (!this.app.options.faucet || typeof this.app.options.faucet !== 'object') {
      this.app.options.faucet = {};
    }
    const faucet = this.app.options.faucet;

    if (!faucet.publickey || !faucet.privatekey) {
      faucet.privatekey = this.app.crypto.generateKeys();
      faucet.publickey = this.app.crypto.generatePublicKey(faucet.privatekey);
      this.app.storage.saveOptions();
    }

    this.publickey = faucet.publickey;
    await this.getSnapshotBalance();
  }

  queuePayment({ publickey }) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        publickey,
        amount: this.mod.amount,
        resolve,
        reject
      });
      this.addPayment('queued');
    });
  }

  async addPayment(reason = '') {
    if (this.app.BROWSER || this.halted) {
      return;
    }

    const slips = this.slips.filter((slip) => {
      return (
        String(slip.publicKey || '') === this.publickey && BigInt(slip.amount || 0) > 0n
      );
    });
    const job = this.queue[0];
    const recipient_public_key = job ? job.publickey : '';
    const payout = job ? this.mod.amount : 0n;
    const available = slipTotal(slips);
    const fee = BigInt(this.app.wallet?.default_fee || 0);

    if (!job && slips.length < 2) {
      return;
    }

    if (job && available < payout + fee) {
      return;
    }

    const tx = this.createTransaction(slips, recipient_public_key);
    if (!tx) {
      return;
    }

    try {
      await this.app.network.propagateTransaction(tx);
    } catch (err) {
      return;
    }

    this.halted = true;
    if (job) {
      this.queue.shift();
      job.resolve(tx);
    }
  }

  /**
   * Build and sign one Faucet transaction from the given slips.
   * Recipient present → payout + change. No recipient → merge to Faucet.
   */
  createTransaction(slips = [], recipient_public_key = '') {
    if (this.app.BROWSER) {
      return null;
    }

    const faucet_publickey = this.publickey || this.app.options.faucet?.publickey || '';
    const faucet_privatekey = this.app.options.faucet?.privatekey || '';
    if (!faucet_publickey || !faucet_privatekey || !slips.length) {
      return null;
    }

    let total_in = 0n;
    for (const row of slips) {
      if (String(row.publicKey || '') !== faucet_publickey) {
        return null;
      }
      total_in += BigInt(row.amount || 0);
    }

    const fee = BigInt(this.app.wallet?.default_fee || 0);
    const payout = recipient_public_key ? this.mod.amount : 0n;
    if (total_in < payout + fee) {
      return null;
    }
    const change = total_in - payout - fee;

    const tx = new Transaction();
    tx.timestamp = Date.now();
    tx.txs_replacements = 1;
    tx.msg = recipient_public_key
      ? { module: 'Faucet', request: 'faucet issuance' }
      : {};

    for (const row of slips) {
      const input = new Slip();
      input.publicKey = row.publicKey;
      input.amount = BigInt(row.amount);
      input.blockId = BigInt(row.blockId);
      input.txOrdinal = BigInt(row.txOrdinal);
      input.index = Number(row.index);
      input.type = Number(row.type) || 0;
      tx.addFromSlip(input);
    }

    // WASM tx.to returns copies, so indexes must be set on the Slip
    // before addToSlip clones it into the transaction.
    let output_index = 0;
    if (recipient_public_key) {
      const paid = new Slip();
      paid.publicKey = recipient_public_key;
      paid.amount = payout;
      paid.type = 0;
      paid.index = output_index++;
      tx.addToSlip(paid);
    }

    if (change > 0n || !recipient_public_key) {
      const rest = new Slip();
      rest.publicKey = faucet_publickey;
      rest.amount = change;
      rest.type = 0;
      rest.index = output_index++;
      tx.addToSlip(rest);
    }

    try {
      tx.packData();

      const assigned = [];
      for (let i = 0; i < output_index; i++) {
        assigned.push(i);
      }
      const reread = outputIndexes(tx);
      if (reread.join(',') !== assigned.join(',')) {
        return null;
      }

      tx.generateHashForSignature();
      const digest = Buffer.from(tx.getHashForSignature());
      if (digest.length !== 32) {
        return null;
      }

      const secp256k1 = require('secp256k1');
      const priv = Buffer.from(faucet_privatekey, 'hex');
      const signed = secp256k1.sign(digest, priv);
      tx.signature = Buffer.from(signed.signature).toString('hex');

      return tx;
    } catch (err) {
      return null;
    }
  }

  async getSnapshotBalance() {
    if (this.app.BROWSER) {
      return;
    }
    const publickey = this.publickey || this.app.options.faucet?.publickey;
    if (!publickey) {
      return;
    }

    try {
      const loaded = require('saito-js/saito');
      const S = loaded.default || loaded;
      const saito = typeof S.getInstance === 'function' ? S.getInstance() : null;
      if (!saito || typeof saito.getBalanceSnapshot !== 'function') {
        return;
      }

      const snapshot = await saito.getBalanceSnapshot([publickey]);
      const rows = snapshot?.rows;
      const slips = [];
      if (rows && typeof rows[Symbol.iterator] === 'function') {
        for (const row of rows) {
          const cols = String(row || '')
            .trim()
            .split(/\s+/);
          if (cols.length < 6 || cols[0] !== publickey) {
            continue;
          }
          slips.push({
            publicKey: cols[0],
            blockId: cols[1],
            txOrdinal: cols[2],
            index: Number(cols[3]),
            amount: cols[4],
            type: Number(cols[5])
          });
        }
      }
      this.slips = slips;

      if (!this.halted && this.queue.length) {
        await this.addPayment('snapshot');
      }
    } catch (err) {
      // snapshot refresh failed — leave slips unchanged
    }
  }

  async onNewBlock(blk, lc) {
    if (this.app.BROWSER || !lc) {
      return;
    }

    const was_halted = this.halted;

    await this.getSnapshotBalance();

    if (was_halted) {
      this.halted = false;
      if (this.queue.length || this.slips.length > 1) {
        await this.addPayment('new block');
      }
    }
  }

  onChainReorganization(_block_id, _block_hash, _lc) {
    if (this.app.BROWSER) {
      return;
    }
    this.halted = true;
  }
}

module.exports = FaucetWallet;
