const { transactionIndexInBlock } = require('./helpers');

function restoreTransaction(app, serialized) {
  const Transaction = require('../../../lib/saito/transaction').default;
  const tx = new Transaction();
  if (typeof tx.deserialize_from_web === 'function') {
    tx.deserialize_from_web(app, serialized);
  }
  return tx;
}

class Refunds {
  constructor(mod) {
    this.mod = mod;
  }

  get app() {
    return this.mod.app;
  }

  get db() {
    return this.mod.warehouse.db;
  }

  retryMs() {
    const configured = Number(this.mod.refund_retry_ms);
    return Number.isFinite(configured) && configured >= 0 ? configured : 6 * 60 * 60 * 1000;
  }

  deadline(row) {
    return Number(row?.created_at || 0) + this.retryMs();
  }

  expired(row, now = Date.now()) {
    return this.deadline(row) <= now;
  }

  identityFromOrder(order, { refund_public_key = '', reason = '' } = {}) {
    return {
      payment_tx_sig: String(order?.payment_tx_sig || '').trim(),
      payment_output_index: Number(order?.payment_output_index ?? 0),
      block_hash_received: String(order?.block_hash_received || ''),
      block_id_received: Number(order?.block_id_received) || 0,
      order_tx_sig: String(order?.order_tx_sig || order?.signature || ''),
      order_id: Number(order?.id) || 0,
      buyer: String(order?.buyer || ''),
      refund_publickey: String(refund_public_key || order?.buyer || ''),
      reason: String(reason || ''),
      utxo_slip: String(order?.utxo_slip || ''),
      access_script: String(order?.access_script || ''),
      payment_amount: Number(order?.payment_amount) || 0
    };
  }

  async issue(order, options = {}) {
    const identity = this.identityFromOrder(order, options);
    if (!identity.payment_tx_sig || !identity.block_hash_received) {
      console.error('Store: refund was not created because its payment identity is incomplete', {
        payment_tx_sig: identity.payment_tx_sig,
        block_hash_received: identity.block_hash_received,
        reason: identity.reason
      });
      if (identity.order_id) {
        try {
          await this.db.updateOrder(identity.order_id, { status: 'unfulfillable' });
        } catch (err) {
          console.error('Store: order could not be marked for manual investigation', {
            order_id: identity.order_id,
            error: err?.message || String(err)
          });
        }
      }
      return { broadcast: false, reason: 'incomplete-payment-identity' };
    }
    let row;
    try {
      row = await this.db.claimRefundIntent(identity);
    } catch (err) {
      console.error('Store: refund intent was not saved', {
        payment_tx_sig: identity.payment_tx_sig,
        payment_output_index: identity.payment_output_index,
        block_hash_received: identity.block_hash_received,
        error: err?.message || String(err)
      });
      return { broadcast: false, reason: 'intent-not-saved', error: err };
    }
    return this.continue(row, order);
  }

  async resume() {
    const rows = (await this.db.returnRefundsNeedingAttention()) || [];
    for (const row of rows) {
      try {
        await this.continue(row);
      } catch (err) {
        console.error('Store: refund resume failed', {
          refund_id: row?.id,
          refund_tx_sig: row?.refund_tx_sig || '',
          error: err?.message || String(err)
        });
      }
    }
  }

  async continue(row, order = null) {
    if (!row) {
      return { broadcast: false, reason: 'missing-refund' };
    }
    if (row.refund_status === 'needs_manual') {
      return { broadcast: false, reason: 'needs-manual', refund: row };
    }
    if (row.refund_status === 'confirmed' && Number(row.longest_chain_refunded) === 1) {
      return { broadcast: false, reason: 'confirmed', refund: row };
    }
    if (this.expired(row)) {
      return this.escalate(row, 'refund retry window expired');
    }
    if (!row.refund_tx_sig) {
      const saved = await this.signOnce(row, order);
      if (!saved?.refund_tx_sig) {
        return saved || { broadcast: false, reason: 'not-signed', refund: row };
      }
      row = saved;
    }
    if (row.refund_status === 'needs_manual') {
      return { broadcast: false, reason: 'needs-manual', refund: row };
    }
    return this.broadcastSaved(row);
  }

  async signOnce(row, order) {
    const source = order || this.orderFromRefund(row);
    let signed;
    try {
      const tx = await this.mod.createOrderRefundTransaction({
        order_row: source,
        refund_public_key: row.refund_publickey,
        reason: row.reason
      });
      if (!tx) {
        throw new Error('refund transaction was not created');
      }
      await tx.sign();
      signed = {
        signature: String(tx.signature || ''),
        serialized: typeof tx.serialize_to_web === 'function' ? tx.serialize_to_web(this.app) || '' : ''
      };
    } catch (err) {
      const message = err?.message || String(err);
      if (this.expired(row) || /spent/i.test(message)) {
        return this.escalate(row, message);
      }
      console.error('Store: refund transaction was not signed', {
        refund_id: row.id,
        payment_tx_sig: row.payment_tx_sig,
        error: message
      });
      return { broadcast: false, reason: 'sign-failed', error: err, refund: row };
    }
    if (!signed.signature || !signed.serialized) {
      return this.escalate(row, 'refund transaction has no signature or serialized form');
    }
    let stored = false;
    try {
      stored = await this.db.saveRefundTransactionIfEmpty(row.id, {
        signature: signed.signature,
        serialized: signed.serialized,
        preparedAt: Date.now()
      });
    } catch (err) {
      console.error('Store: refund transaction was signed but not saved, so it was not broadcast', {
        refund_id: row.id,
        signature: signed.signature,
        error: err?.message || String(err)
      });
      return { broadcast: false, reason: 'save-failed', error: err, refund: row };
    }
    const current = await this.db.returnRefundByPayment(
      row.payment_tx_sig,
      row.payment_output_index,
      row.block_hash_received
    );
    if (!stored && current?.refund_tx_sig && current.refund_tx_sig !== signed.signature) {
      console.error('Store: discarded an unsigned-for-broadcast refund that lost the claim', {
        refund_id: row.id,
        discarded_signature: signed.signature,
        retained_signature: current.refund_tx_sig
      });
    }
    return current;
  }

  orderFromRefund(row) {
    return {
      id: row.order_id,
      order_tx_sig: row.order_tx_sig,
      buyer: row.buyer,
      payment_tx_sig: row.payment_tx_sig,
      payment_output_index: row.payment_output_index,
      payment_amount: row.payment_amount,
      utxo_slip: row.utxo_slip,
      access_script: row.access_script,
      block_hash_received: row.block_hash_received,
      block_id_received: row.block_id_received
    };
  }

  async broadcastSaved(row) {
    if (!row?.refund_tx || !row?.refund_tx_sig) {
      return { broadcast: false, reason: 'missing-saved-transaction', refund: row };
    }
    if (this.expired(row)) {
      return this.escalate(row, 'refund retry window expired');
    }
    const attempts = Number(row.refund_broadcast_attempts || 0) + 1;
    let broadcastError = null;
    try {
      const tx = restoreTransaction(this.app, row.refund_tx);
      await this.app.network.propagateTransaction(tx);
    } catch (err) {
      broadcastError = err;
    }
    const status = broadcastError ? 'uncertain' : 'submitted';
    try {
      await this.db.markRefundStatus(row.id, status, {
        error: broadcastError ? broadcastError.message || String(broadcastError) : '',
        attempts
      });
    } catch (err) {
      console.error('Store: refund status update failed after the saved transaction was kept', {
        refund_id: row.id,
        refund_tx_sig: row.refund_tx_sig,
        error: err?.message || String(err)
      });
    }
    if (broadcastError) {
      console.error('Store: refund propagation failed; the saved transaction will be retried', {
        refund_id: row.id,
        refund_tx_sig: row.refund_tx_sig,
        error: broadcastError.message || String(broadcastError)
      });
    }
    const current = await this.db.returnRefundBySignature(row.refund_tx_sig);
    return {
      broadcast: !broadcastError,
      confirmed: false,
      refund: current || { ...row, refund_status: status, refund_broadcast_attempts: attempts }
    };
  }

  async escalate(row, error) {
    const message = String(error || 'refund requires manual intervention');
    try {
      await this.db.markRefundStatus(row.id, 'needs_manual', { error: message });
    } catch (err) {
      console.error('Store: could not record that a refund needs manual intervention', {
        refund_id: row.id,
        refund_tx_sig: row.refund_tx_sig || '',
        error: err?.message || String(err)
      });
    }
    console.error('Store: refund requires manual intervention', {
      refund_id: row.id,
      refund_tx_sig: row.refund_tx_sig || '',
      payment_tx_sig: row.payment_tx_sig,
      payment_output_index: row.payment_output_index,
      block_hash_received: row.block_hash_received,
      error: message
    });
    const current =
      (await this.db.returnRefundByPayment(
        row.payment_tx_sig,
        row.payment_output_index,
        row.block_hash_received
      )) || row;
    return { broadcast: false, reason: 'needs-manual', refund: current };
  }

  async observeInclusion(blk, tx) {
    const signature = String(tx?.signature || '');
    if (!signature) {
      return null;
    }
    const changes = await this.db.recordRefundInclusion(signature, {
      block_id: Number(blk?.id ?? 0),
      block_hash: String(blk?.hash ?? ''),
      transaction_id: transactionIndexInBlock(blk, tx)
    });
    if (!changes) {
      console.error('Store: included refund has no saved transaction', { refund_tx_sig: signature });
      return null;
    }
    return this.db.returnRefundBySignature(signature);
  }
}

module.exports = Refunds;
