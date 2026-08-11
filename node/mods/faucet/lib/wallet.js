/**
 * Poor-man's Faucet wallet. Keys in app.options.faucet.
 * slips[] are rebuilt from getBalanceSnapshot; the chain is the source of truth.
 *
 * WASM Transaction.sign() always signs with the node wallet key. Faucet
 * transactions are signed with app.crypto.signBuffer() and the Faucet private
 * key over the same serialize-for-signature buffer Saito verifies.
 */

const Transaction = require('../../../lib/saito/transaction').default;
const Slip = require('../../../lib/saito/slip').default;

function serializeSlipForSignature(app, slip) {
  const publickey_hex = app.crypto.fromBase58(String(slip.publicKey || ''));
  const publickey = Buffer.from(publickey_hex, 'hex');
  const amount = Buffer.alloc(8);
  amount.writeBigUInt64BE(BigInt(slip.amount || 0));
  return Buffer.concat([
    publickey,
    amount,
    Buffer.from([Number(slip.index) & 0xff]),
    Buffer.from([Number(slip.type || 0) & 0xff])
  ]);
}

function serializeTransactionForSignature(app, tx) {
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(tx.timestamp || 0));
  const replacements = Buffer.alloc(4);
  replacements.writeUInt32BE(Number(tx.txs_replacements || 0));
  const type = Buffer.alloc(4);
  type.writeUInt32BE(Number(tx.type || 0));
  return Buffer.concat([
    timestamp,
    Buffer.concat((tx.from || []).map((slip) => serializeSlipForSignature(app, slip))),
    Buffer.concat((tx.to || []).map((slip) => serializeSlipForSignature(app, slip))),
    replacements,
    type,
    Buffer.from(tx.data || [])
  ]);
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
      this.makePayment();
    });
  }

  async makePayment() {
    if (this.app.BROWSER || this.halted) {
      return;
    }

    const slips = this.slips.filter((slip) => {
      return (
        String(slip.publicKey || '') === this.publickey && BigInt(slip.amount || 0) > 0n
      );
    });

    const job = this.queue[0];
    let recipient_public_key = '';
    if (job) {
      recipient_public_key = job.publickey;
    } else if (slips.length < 2) {
      return;
    }

    const tx = this.createTransaction(slips, recipient_public_key);
    if (!tx) {
      return;
    }

    try {
      await this.app.network.propagateTransaction(tx);
    } catch (err) {
      console.error('FAUCET WALLET: propagate failed', err);
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

    if (recipient_public_key) {
      const paid = new Slip();
      paid.publicKey = recipient_public_key;
      paid.amount = payout;
      paid.type = 0;
      tx.addToSlip(paid);
    }

    if (change > 0n || !recipient_public_key) {
      const rest = new Slip();
      rest.publicKey = faucet_publickey;
      rest.amount = change;
      rest.type = 0;
      tx.addToSlip(rest);
    }

    try {
      tx.packData();
      const outputs = tx.to || [];
      for (let i = 0; i < outputs.length; i++) {
        outputs[i].index = i;
      }

      tx.signature = this.app.crypto.signBuffer(
        serializeTransactionForSignature(this.app, tx),
        faucet_privatekey
      );
      return tx;
    } catch (err) {
      console.error('FAUCET WALLET: createTransaction failed', err);
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
    } catch (err) {
      console.error('FAUCET WALLET: getSnapshotBalance failed', err);
    }
  }

  async onNewBlock(blk, lc) {
    if (this.app.BROWSER || !lc) {
      return;
    }

    await this.getSnapshotBalance();
    this.halted = false;
    await this.makePayment();
  }

  onChainReorganization(_block_id, _block_hash, _lc) {
    if (this.app.BROWSER) {
      return;
    }
    this.halted = true;
  }
}

module.exports = FaucetWallet;
