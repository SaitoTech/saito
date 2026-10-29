const { addDecimalAmounts, multiplyDecimalAmount } = require('./web3-amount');
const {
  canonicalJson,
  quoteTimestamp,
  quoteIsExpired,
  signQuote,
  verifyQuote
} = require('./withdrawal-quote');

const SUPPORT_EMAIL = 'info@saito.io';
const SUPPORT_URL = 'https://wiki.saito.io/applications/store/payments';

function treasuryPublicKey(mod) {
  const buysaito = mod.app?.modules?.returnModule?.('BuySaito');
  const authorized = String(buysaito?.authorized_public_key || '').trim();
  if (authorized) {
    return authorized;
  }
  const configured = mod.web3_payment_processor_publickey;
  const listed = Array.isArray(configured) ? configured : configured ? [configured] : [];
  for (const candidate of [...listed, mod.publicKey]) {
    const key = String(candidate || '').trim();
    if (key) {
      return key;
    }
  }
  return '';
}

function pairsFromQuote(data) {
  const transfers = Array.isArray(data?.transfer_uuids) ? data.transfer_uuids : null;
  const payments = Array.isArray(data?.payment_uuids) ? data.payment_uuids : null;
  if (!transfers || !payments || transfers.length !== payments.length || !transfers.length) {
    return null;
  }
  const seenTransfers = new Set();
  const seenPayments = new Set();
  const pairs = [];
  for (let i = 0; i < transfers.length; i += 1) {
    const transfer = String(transfers[i] || '').trim();
    const payment = String(payments[i] || '').trim();
    if (!transfer || !payment || seenTransfers.has(transfer) || seenPayments.has(payment)) {
      return null;
    }
    seenTransfers.add(transfer);
    seenPayments.add(payment);
    pairs.push({ transfer, payment });
  }
  return pairs;
}

function withdrawalAddressIsValid(ticker, address) {
  try {
    const MixinModule = require('../../mixin/lib/mixinmodule');
    return (
      MixinModule.prototype.validateAddress.call(
        { ticker, chain_id: '', mixin: null },
        address
      ) === true
    );
  } catch (err) {
    return false;
  }
}

function paidToTreasury(tx, treasury) {
  let total = 0n;
  let addressed = false;
  for (const slip of tx?.to || []) {
    if (String(slip?.publicKey || '') !== treasury) {
      continue;
    }
    addressed = true;
    try {
      total += BigInt(slip.amount ?? 0);
    } catch (err) {
      return { addressed: false, total: 0n };
    }
  }
  return { addressed, total };
}

class StoreWithdrawals {
  constructor(mod) {
    this.mod = mod;
    this.quoteSequence = 0;
  }

  get app() {
    return this.mod.app;
  }

  get db() {
    return this.mod.warehouse.db;
  }

  query(sql, params) {
    return this.app.storage.queryDatabase(sql, params, this.mod.dbname || 'store');
  }

  run(sql, params) {
    return this.app.storage.runDatabase(sql, params, this.mod.dbname || 'store');
  }

  treasuryIsConnected(treasury) {
    const peers = this.app.network?.peers || [];
    return peers.some((peer) => String(peer?.publicKey || '') === treasury);
  }

  async latestBlockId() {
    try {
      return Number(await this.app.blockchain?.getLatestBlockId?.());
    } catch (err) {
      return NaN;
    }
  }

  async eligibleSales(seller, ticker) {
    const latest = await this.latestBlockId();
    const wait = Number(this.mod.web3_withdrawal_blocks);
    if (!seller || !ticker || !Number.isFinite(latest) || !Number.isFinite(wait)) {
      return [];
    }
    const rows = await this.query(
      `SELECT transfer_uuid, inbound_payment_uuid, web3_amount, quantity_sold, block_id_sold
       FROM listing_sales
       WHERE seller = $seller
         AND UPPER(TRIM(web3_ticker)) = $ticker
         AND transfer_uuid <> ''
         AND inbound_payment_uuid <> ''
         AND web3_payment_withdrawal_processed = 0
         AND IFNULL(web3_payment_withdrawal_request, '') = ''
         AND longest_chain_sold = 1
         AND block_id_sold > 0`,
      { $seller: seller, $ticker: ticker }
    );
    return (rows || []).filter((row) => latest >= Number(row.block_id_sold) + wait);
  }

  sumSales(rows) {
    let total = '0';
    for (const row of rows) {
      const earned = multiplyDecimalAmount(row.web3_amount, row.quantity_sold);
      if (!earned) {
        return '';
      }
      total = addDecimalAmounts(total, earned);
    }
    return total;
  }

  async createQuote({ seller, ticker, withdrawalAddress } = {}) {
    const symbol = String(ticker || '').trim().toUpperCase();
    const address = String(withdrawalAddress || '').trim();
    const treasury = treasuryPublicKey(this.mod);
    if (!seller) {
      return { err: 'A signed request is required.' };
    }
    if (!symbol || symbol === 'SAITO') {
      return { err: 'A web3 ticker is required.' };
    }
    if (!address) {
      return { err: 'A withdrawal address is required.' };
    }
    if (!treasury) {
      return { err: 'The treasury public key is not configured.' };
    }
    const sales = await this.eligibleSales(seller, symbol);
    if (!sales.length) {
      return { err: 'No eligible proceeds are available for withdrawal.' };
    }
    const withdrawalAmount = this.sumSales(sales);
    if (!withdrawalAmount || withdrawalAmount === '0') {
      return { err: 'No eligible proceeds are available for withdrawal.' };
    }
    const data = {
      amount: String(this.mod.fee ?? 0),
      publickey: treasury,
      ticker: symbol,
      withdrawal_amount: withdrawalAmount,
      withdrawal_address: address,
      transfer_uuids: sales.map((row) => String(row.transfer_uuid)),
      payment_uuids: sales.map((row) => String(row.inbound_payment_uuid)),
      timestamp: quoteTimestamp(Date.now(), (this.quoteSequence += 1))
    };
    const privateKey = await this.app.wallet.getPrivateKey();
    const signature = signQuote(this.app.crypto, data, privateKey);
    return { data, signature };
  }

  async acceptSubmittedTransaction(outer, serialized = '') {
    const message = outer?.returnMessage?.() || {};
    const envelope = message.data && typeof message.data === 'object' ? message.data : {};
    const embedded = envelope.transaction ?? message.transaction;
    let tx = outer;
    let stored = serialized;
    if (embedded && typeof embedded === 'object') {
      tx = embedded;
      stored = serialized || embedded.signature || '';
    } else if (typeof embedded === 'string' && embedded) {
      stored = embedded;
      tx = this.restoreTransaction(embedded);
      if (!tx) {
        return { err: 'The withdrawal transaction could not be read.' };
      }
    }
    const txmsg = tx.returnMessage?.() || {};
    if (txmsg.request !== 'store-withdrawal') {
      return { err: 'That transaction is not a store withdrawal.' };
    }
    const sender = String(tx.from?.[0]?.publicKey || '').trim();
    if (!tx.signature || !sender) {
      return { err: 'The withdrawal transaction is not signed.' };
    }
    if (typeof tx.isValid === 'function' && tx.isValid() !== true) {
      return { err: 'The withdrawal transaction signature is not valid.' };
    }
    const outerSender = String(outer?.from?.[0]?.publicKey || sender).trim();
    if (outer !== tx && outerSender !== sender) {
      return { err: 'The withdrawal transaction sender does not match the request.' };
    }
    if (!stored && typeof tx.serialize_to_web === 'function') {
      stored = tx.serialize_to_web(this.app) || '';
    }

    const existing = await this.findByTransaction(tx.signature);
    if (existing) {
      return this.finishExisting(existing, tx);
    }

    const data = txmsg.data;
    const signature = String(txmsg.signature || '');
    if (!verifyQuote(this.app, data, signature, this.mod.publicKey)) {
      return { err: 'The store withdrawal quote signature is not valid.' };
    }
    if (quoteIsExpired(data.timestamp)) {
      return { err: 'The withdrawal quote has expired.' };
    }
    const consumed = await this.findByRequest(data.timestamp);
    if (consumed && consumed.saito_tx_sig !== tx.signature) {
      return { err: 'That withdrawal quote was already used.' };
    }
    const treasury = treasuryPublicKey(this.mod);
    if (
      data.publickey !== treasury ||
      String(data.amount) !== String(this.mod.fee ?? 0) ||
      String(data.ticker || '').toUpperCase() !== String(data.ticker || '')
    ) {
      return { err: 'The withdrawal quote does not match the current treasury terms.' };
    }
    const ticker = String(data.ticker || '').trim().toUpperCase();
    if (data.ticker !== ticker) {
      return { err: 'The withdrawal quote does not match the current treasury terms.' };
    }
    const pairs = pairsFromQuote(data);
    if (!pairs) {
      return { err: 'The withdrawal quote identifiers are not valid.' };
    }
    const address = String(data.withdrawal_address || '').trim();
    if (!address) {
      return { err: 'The withdrawal address is missing from the signed quote.' };
    }
    if (!withdrawalAddressIsValid(ticker, address)) {
      return { err: 'The withdrawal address is not valid for this cryptocurrency.' };
    }
    const sales = await this.eligibleSales(sender, ticker);
    const expected = this.sumSales(
      pairs.map((pair) => sales.find((row) => row.transfer_uuid === pair.transfer && row.inbound_payment_uuid === pair.payment)).filter(Boolean)
    );
    const matched = pairs.every((pair) =>
      sales.some((row) => row.transfer_uuid === pair.transfer && row.inbound_payment_uuid === pair.payment)
    );
    if (!matched || expected !== String(data.withdrawal_amount)) {
      return { err: 'The quoted proceeds are no longer eligible.' };
    }
    const required = BigInt(this.app.wallet.convertSaitoToNolan(data.amount) ?? 0);
    const paid = paidToTreasury(tx, data.publickey);
    if (!paid.addressed || paid.total < required) {
      return { err: 'The transaction does not pay the treasury the required SAITO amount.' };
    }

    const now = Date.now();
    let created;
    try {
      created = await this.db.withImmediateTransaction(async (db) => {
        for (const pair of pairs) {
          const result = await db.run(
            `UPDATE listing_sales
             SET web3_payment_withdrawal_request = $request,
                 web3_payment_withdrawal_publickey = $sender,
                 web3_payment_withdrawal_address = $address,
                 web3_payment_withdrawal_created_at = $now,
                 updated_at = $now
             WHERE seller = $seller
               AND transfer_uuid = $transfer
               AND inbound_payment_uuid = $payment
               AND UPPER(TRIM(web3_ticker)) = $ticker
               AND web3_payment_withdrawal_processed = 0
               AND IFNULL(web3_payment_withdrawal_request, '') = ''
               AND longest_chain_sold = 1`,
            {
              $request: data.timestamp,
              $sender: sender,
              $address: address,
              $now: now,
              $seller: sender,
              $transfer: pair.transfer,
              $payment: pair.payment,
              $ticker: ticker
            }
          );
          if (Number(result?.changes || 0) !== 1) {
            throw new Error('The quoted proceeds are no longer eligible.');
          }
        }
        await db.run(
          `INSERT INTO store_withdrawals (
             request_id, requester_publickey, treasury_publickey, ticker,
             saito_amount, withdrawal_amount, withdrawal_address,
             transfer_uuids, payment_uuids, quote_timestamp, quote_signature, quote_data,
             saito_tx_sig, saito_tx, status, last_error, created_at, updated_at
           ) VALUES (
             $request_id, $requester, $treasury, $ticker,
             $saito_amount, $withdrawal_amount, $withdrawal_address,
             $transfer_uuids, $payment_uuids, $quote_timestamp, $quote_signature, $quote_data,
             $saito_tx_sig, $saito_tx, 'accepted', '', $now, $now
           )`,
          {
            $request_id: data.timestamp,
            $requester: sender,
            $treasury: data.publickey,
            $ticker: ticker,
            $saito_amount: String(data.amount),
            $withdrawal_amount: String(data.withdrawal_amount),
            $withdrawal_address: address,
            $transfer_uuids: JSON.stringify(data.transfer_uuids),
            $payment_uuids: JSON.stringify(data.payment_uuids),
            $quote_timestamp: data.timestamp,
            $quote_signature: signature,
            $quote_data: canonicalJson(data),
            $saito_tx_sig: tx.signature,
            $saito_tx: stored || '',
            $now: now
          }
        );
        return true;
      });
    } catch (err) {
      const prior = await this.findByTransaction(tx.signature);
      if (prior) {
        return this.finishExisting(prior, tx);
      }
      const consumed = await this.findByRequest(data.timestamp);
      if (consumed) {
        return { err: 'That withdrawal quote was already used.' };
      }
      return { err: err?.message || 'The withdrawal could not be reserved.' };
    }

    if (!created) {
      return { err: 'The withdrawal could not be reserved.' };
    }
    const row = await this.findByRequest(data.timestamp);
    if (!row) {
      return { err: 'The withdrawal could not be reserved.' };
    }
    return this.forwardWithdrawal(row.id, tx);
  }

  restoreTransaction(serialized) {
    try {
      const Transaction = require('../../../lib/saito/transaction').default;
      const tx = new Transaction();
      tx.deserialize_from_web(this.app, serialized);
      return tx;
    } catch (err) {
      return null;
    }
  }

  async findByTransaction(signature) {
    const rows = await this.query(
      `SELECT * FROM store_withdrawals WHERE saito_tx_sig = $signature LIMIT 1`,
      { $signature: signature }
    );
    return rows?.[0] || null;
  }

  async findByRequest(requestId) {
    const rows = await this.query(
      `SELECT * FROM store_withdrawals WHERE request_id = $request LIMIT 1`,
      { $request: requestId }
    );
    return rows?.[0] || null;
  }

  async finishExisting(row, tx) {
    if (row.status === 'submitted') {
      return {
        status: 'submitted',
        message: 'Withdrawal request submitted to the treasury. The external cryptocurrency has not been sent.',
        id: row.id
      };
    }
    if (row.status === 'accepted' || row.status === 'forward_failed') {
      return this.forwardWithdrawal(row.id, tx);
    }
    return {
      status: row.status,
      message: 'Withdrawal request accepted by the Store. The external cryptocurrency has not been sent.',
      id: row.id,
      err: row.last_error || ''
    };
  }

  async forwardWithdrawal(id, tx) {
    const rows = await this.query(`SELECT * FROM store_withdrawals WHERE id = $id`, { $id: id });
    const row = rows?.[0];
    if (!row) {
      return { err: 'The withdrawal request was not found.' };
    }
    if (row.status === 'submitted') {
      return {
        status: 'submitted',
        message: 'Withdrawal request submitted to the treasury. The external cryptocurrency has not been sent.',
        id: row.id
      };
    }
    const treasury = row.treasury_publickey;
    let result;
    if (treasury === this.mod.publicKey) {
      const mixin = this.app.modules?.returnModule?.('Mixin');
      if (!mixin?.receiveStoreWithdrawal) {
        result = { err: 'The local Mixin module is not available.' };
      } else {
        result = await mixin.receiveStoreWithdrawal(tx, { publicKey: this.mod.publicKey });
      }
    } else if (this.treasuryIsConnected(treasury) && this.app.network?.sendRequestAsTransaction) {
      result = await new Promise((resolve) => {
        this.app.network.sendRequestAsTransaction(
          'store-withdrawal',
          {
            module: 'Mixin',
            transaction: row.saito_tx || ''
          },
          (response) => resolve(response || { err: 'The treasury did not accept the withdrawal.' }),
          treasury
        );
      });
    } else {
      result = { err: 'The treasury is not connected.' };
    }

    const now = Date.now();
    if (result?.err || !result?.transfer_id) {
      const error = result?.err || 'The treasury did not record the withdrawal.';
      await this.run(
        `UPDATE store_withdrawals
         SET status = 'forward_failed', last_error = $error, updated_at = $now
         WHERE id = $id AND status <> 'submitted'`,
        { $error: error, $now: now, $id: id }
      );
      return {
        status: 'forward_failed',
        err: error,
        message: 'The Store accepted the withdrawal, but it was not submitted to the treasury.',
        id
      };
    }
    await this.run(
      `UPDATE store_withdrawals
       SET status = 'submitted', last_error = '', mixin_transfer_id = $transfer, updated_at = $now
       WHERE id = $id`,
      { $transfer: result.transfer_id, $now: now, $id: id }
    );
    return {
      status: 'submitted',
      message: 'Withdrawal request submitted to the treasury. The external cryptocurrency has not been sent.',
      id,
      transfer_id: result.transfer_id
    };
  }
}

module.exports = StoreWithdrawals;
module.exports.SUPPORT_EMAIL = SUPPORT_EMAIL;
module.exports.SUPPORT_URL = SUPPORT_URL;
module.exports.treasuryPublicKey = treasuryPublicKey;
module.exports.canonicalJson = canonicalJson;
