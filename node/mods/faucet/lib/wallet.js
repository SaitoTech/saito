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

function canonicalHash(tx) {
  tx.generateHashForSignature();
  return Buffer.from(tx.getHashForSignature()).toString('hex');
}

function logOutputs(tag, tx) {
  (tx.to || []).forEach((slip, i) => {
    console.log(
      '[FaucetWallet][' +
        tag +
        '] output[' +
        i +
        '] pk=' +
        slip.publicKey +
        ' amount=' +
        String(slip.amount) +
        ' index=' +
        slip.index +
        ' type=' +
        slip.type
    );
  });
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
    console.log('[FaucetWallet] initialized publickey=' + this.publickey);
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
      console.log(
        '[FaucetWallet] queuePayment recipient=' +
          publickey +
          ' amount=' +
          this.mod.amount.toString() +
          ' queue_length=' +
          this.queue.length
      );
      this.addPayment('queued');
    });
  }

  async addPayment(reason = '') {
    console.log(
      '[FaucetWallet] addPayment reason=' +
        (reason || 'unspecified') +
        ' halted=' +
        this.halted +
        ' queue_length=' +
        this.queue.length +
        ' slips=' +
        this.slips.length +
        ' balance=' +
        slipTotal(this.slips).toString()
    );

    if (this.app.BROWSER || this.halted) {
      console.log('[FaucetWallet] addPayment skipped browser=' + !!this.app.BROWSER + ' halted=' + this.halted);
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

    console.log(
      '[FaucetWallet] addPayment recipient=' +
        (recipient_public_key || '(merge)') +
        ' amount=' +
        payout.toString() +
        ' spendable_slips=' +
        slips.length +
        ' available=' +
        available.toString() +
        ' fee=' +
        fee.toString()
    );

    if (!job && slips.length < 2) {
      console.log('[FaucetWallet] addPayment idle — no queued payment and no merge needed');
      return;
    }

    if (job && available < payout + fee) {
      console.log(
        '[FaucetWallet] addPayment waiting — insufficient slips for payout+fee needed=' +
          (payout + fee).toString()
      );
      return;
    }

    const tx = this.createTransaction(slips, recipient_public_key);
    if (!tx) {
      console.log('[FaucetWallet] addPayment no transaction created');
      return;
    }

    console.log(
      '[FaucetWallet] addPayment transaction created signature=' + (tx.signature || '')
    );

    try {
      if (typeof tx.clone === 'function') {
        const cloned = tx.clone();
        const propagate_hash = canonicalHash(cloned);
        const propagate_indexes = outputIndexes(cloned);
        console.log(
          '[FaucetWallet][PROPAGATE-TRACE] output indexes=[' +
            propagate_indexes.join(',') +
            '] hash=' +
            propagate_hash
        );
        logOutputs('PROPAGATE-TRACE', cloned);
      }
      console.log('[FaucetWallet] addPayment propagating signature=' + (tx.signature || ''));
      await this.app.network.propagateTransaction(tx);
      console.log('[FaucetWallet] addPayment propagate ok signature=' + (tx.signature || ''));
    } catch (err) {
      console.error('[FaucetWallet] addPayment propagate failed', err?.message || err);
      return;
    }

    this.halted = true;
    if (job) {
      this.queue.shift();
      console.log(
        '[FaucetWallet] addPayment queued request completed remaining_queue=' + this.queue.length
      );
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
      console.log(
        '[FaucetWallet] createTransaction skipped publickey=' +
          !!faucet_publickey +
          ' slips=' +
          slips.length
      );
      return null;
    }

    let total_in = 0n;
    for (const row of slips) {
      if (String(row.publicKey || '') !== faucet_publickey) {
        console.log('[FaucetWallet] createTransaction rejected — slip is not Faucet-owned');
        return null;
      }
      total_in += BigInt(row.amount || 0);
    }

    const fee = BigInt(this.app.wallet?.default_fee || 0);
    const payout = recipient_public_key ? this.mod.amount : 0n;
    if (total_in < payout + fee) {
      console.log(
        '[FaucetWallet] createTransaction insufficient total_in=' +
          total_in.toString() +
          ' payout=' +
          payout.toString() +
          ' fee=' +
          fee.toString()
      );
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

    console.log(
      '[FaucetWallet] createTransaction inputs=' +
        slips.length +
        ' total_in=' +
        total_in.toString() +
        ' payment=' +
        (recipient_public_key ? payout.toString() + ' -> ' + recipient_public_key : 'none') +
        ' change=' +
        change.toString() +
        ' fee=' +
        fee.toString()
    );

    try {
      tx.packData();

      const assigned = [];
      for (let i = 0; i < output_index; i++) {
        assigned.push(i);
      }
      const reread = outputIndexes(tx);
      console.log(
        '[FaucetWallet][OUTPUT-TRACE] assigned indexes: [' + assigned.join(',') + ']'
      );
      console.log(
        '[FaucetWallet][OUTPUT-TRACE] reread indexes:   [' + reread.join(',') + ']'
      );
      logOutputs('OUTPUT-TRACE', tx);
      if (reread.join(',') !== assigned.join(',')) {
        console.log('[FaucetWallet][OUTPUT-TRACE] underlying output indexes did not stick');
        return null;
      }

      const data = Buffer.from(tx.data || []);
      tx.generateHashForSignature();
      const digest = Buffer.from(tx.getHashForSignature());
      if (digest.length !== 32) {
        console.log('[FaucetWallet][SIGN-TRACE] canonical hash missing length=' + digest.length);
        return null;
      }
      const signed_hash = digest.toString('hex');

      console.log(
        '[FaucetWallet][SIGN-TRACE] inputs=' +
          (tx.from || []).length +
          ' outputs=' +
          (tx.to || []).length +
          ' output indexes=[' +
          reread.join(',') +
          '] type=' +
          tx.type +
          ' txs_replacements=' +
          tx.txs_replacements +
          ' timestamp=' +
          tx.timestamp +
          ' data=' +
          data.toString('utf8') +
          ' hash=' +
          signed_hash
      );

      const secp256k1 = require('secp256k1');
      const priv = Buffer.from(faucet_privatekey, 'hex');
      const signed = secp256k1.sign(digest, priv);
      tx.signature = Buffer.from(signed.signature).toString('hex');

      console.log(
        '[FaucetWallet][SIGN-TRACE] publickey=' +
          faucet_publickey +
          ' hash=' +
          signed_hash +
          ' signature=' +
          (tx.signature || '')
      );

      if (typeof tx.clone === 'function') {
        const cloned = tx.clone();
        const clone_indexes = outputIndexes(cloned);
        const clone_hash = canonicalHash(cloned);
        console.log(
          '[FaucetWallet][CLONE-TRACE] output indexes=[' +
            clone_indexes.join(',') +
            '] hash=' +
            clone_hash +
            ' matches_signed=' +
            (clone_hash === signed_hash)
        );
        logOutputs('CLONE-TRACE', cloned);
      }

      return tx;
    } catch (err) {
      console.error('[FaucetWallet] createTransaction failed', err?.message || err);
      return null;
    }
  }

  async getSnapshotBalance() {
    if (this.app.BROWSER) {
      return;
    }
    const publickey = this.publickey || this.app.options.faucet?.publickey;
    if (!publickey) {
      console.log('[FaucetWallet] getSnapshotBalance skipped — no Faucet publickey');
      return;
    }

    console.log('[FaucetWallet] getSnapshotBalance requested publickey=' + publickey);

    try {
      const loaded = require('saito-js/saito');
      const S = loaded.default || loaded;
      const saito = typeof S.getInstance === 'function' ? S.getInstance() : null;
      if (!saito || typeof saito.getBalanceSnapshot !== 'function') {
        console.log('[FaucetWallet] getSnapshotBalance unavailable — no Saito snapshot API');
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
      const balance = slipTotal(slips);
      console.log(
        '[FaucetWallet] getSnapshotBalance slips=' +
          slips.length +
          ' balance=' +
          balance.toString() +
          ' halted=' +
          this.halted +
          ' queue_length=' +
          this.queue.length
      );

      if (!this.halted && this.queue.length) {
        console.log('[FaucetWallet] getSnapshotBalance retrying queued payment');
        await this.addPayment('snapshot');
      }
    } catch (err) {
      console.error('[FaucetWallet] getSnapshotBalance failed', err?.message || err);
    }
  }

  async onNewBlock(blk, lc) {
    if (this.app.BROWSER || !lc) {
      return;
    }

    const was_halted = this.halted;
    console.log(
      '[FaucetWallet] onNewBlock id=' +
        (blk?.id != null ? String(blk.id) : '?') +
        ' halted=' +
        was_halted +
        ' pending=' +
        this.queue.length +
        ' slips=' +
        this.slips.length +
        ' balance=' +
        slipTotal(this.slips).toString()
    );

    await this.getSnapshotBalance();

    if (was_halted) {
      this.halted = false;
      console.log('[FaucetWallet] onNewBlock reconciled — resuming');
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
    console.log('[FaucetWallet] onChainReorganization halted=true');
  }
}

module.exports = FaucetWallet;
