const OPEN_STATUSES = [
  'inbound_awaiting',
  'inbound_broadcast',
  'inbound_confirmed',
  'outbound_awaiting',
  'outbound_broadcast'
];

const TEST_SENDER = 'admin-test';
const TEST_HASH = 'admin-test';

function testTransferId(id) {
  return `${TEST_HASH}:${id}`;
}

function transferId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return 0;
  }
  return id;
}

class TransferTesting {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  async listOutstandingTransfers() {
    const rows = [];
    for (const status of OPEN_STATUSES) {
      const found = await this.mod.database.getTransfers({ status, purpose: 'buysaito' });
      rows.push(...(found || []));
    }
    const manual = await this.mod.database.getTransfers({
      purpose: 'migration',
      mode: 'manual'
    });
    for (const row of manual || []) {
      if (['failed', 'cancelled', 'outbound_confirmed', 'succeeded'].includes(row.status)) {
        continue;
      }
      rows.push(row);
    }
    rows.sort((left, right) => Number(left.id) - Number(right.id));
    return { transfers: rows.map((row) => this.snapshot(row)) };
  }

  async advanceTransfer(id, action) {
    const transfer = await this.returnBuySaitoTransfer(id);
    if (action === 'detect-inbound') {
      await this.detectInbound(transfer);
    } else if (action === 'confirm-inbound') {
      await this.confirmInbound(transfer);
    } else {
      throw new Error(`Unknown payment test action: ${action || ''}`);
    }
    return this.listOutstandingTransfers();
  }

  async returnBuySaitoTransfer(id) {
    const transferIdValue = transferId(id);
    const rows = transferIdValue
      ? await this.mod.database.getTransfers({ id: transferIdValue })
      : [];
    const transfer = rows?.[0];
    if (!transfer || transfer.purpose !== 'buysaito') {
      throw new Error('No outstanding BuySaito transfer matches that id.');
    }
    return transfer;
  }

  async detectInbound(transfer) {
    if (transfer.status !== 'inbound_awaiting') {
      throw new Error(
        `Transfer ${transfer.id} cannot be marked detected from status ${transfer.status}.`
      );
    }

    const required = Math.max(Number(transfer.inbound_confirmations_required) || 0, 1);
    await this.mod.database.updateTransfer(transfer.id, {
      status: 'inbound_broadcast',
      inbound_tx_hash: TEST_HASH,
      inbound_tx_id: testTransferId(transfer.id),
      inbound_sender: TEST_SENDER,
      inbound_confirmations: 0,
      inbound_confirmations_required: required,
      inbound_received_at: Date.now()
    });

    const updated = await this.returnBuySaitoTransfer(transfer.id);
    this.notifyPaymentDetected(updated, 'pending');
  }

  async confirmInbound(transfer) {
    if (
      transfer.status !== 'inbound_broadcast' ||
      transfer.inbound_tx_id !== testTransferId(transfer.id)
    ) {
      throw new Error(`Transfer ${transfer.id} cannot be marked confirmed from its current evidence.`);
    }

    const required = Math.max(Number(transfer.inbound_confirmations_required) || 0, 1);
    await this.mod.database.updateTransfer(transfer.id, {
      status: 'inbound_confirmed',
      inbound_confirmations: required,
      inbound_confirmations_required: required
    });

    const updated = await this.returnBuySaitoTransfer(transfer.id);
    this.notifyPaymentDetected(updated, 'confirmed');
  }

  notifyPaymentDetected(transfer, status) {
    const detected = {
      id: transfer.id,
      address: transfer.inbound_address,
      ticker: transfer.inbound_ticker,
      status,
      initiator_pubkey: transfer.requester_publickey
    };
    this.app.network.sendRequestAsTransaction(
      'buysaito payment detected',
      detected,
      null,
      transfer.requester_publickey
    );
    this.app.connection.emit('saito-purchase-payment-detected', detected);
  }

  snapshot(transfer) {
    return {
      id: transfer.id,
      requester_publickey: transfer.requester_publickey || '',
      recipient_publickey: transfer.recipient_publickey || '',
      inbound_ticker: transfer.inbound_ticker || '',
      inbound_amount: transfer.inbound_amount || '',
      outbound_ticker: transfer.outbound_ticker || 'SAITO',
      outbound_amount: transfer.outbound_amount || '',
      status: transfer.status,
      last_error: transfer.last_error || '',
      purpose: transfer.purpose || '',
      mode: transfer.mode || '',
      inbound_tx_hash: transfer.inbound_tx_hash || '',
      inbound_sender: transfer.inbound_sender || '',
      outbound_tx_sig: transfer.outbound_tx_sig || '',
      action: this.nextAction(transfer)
    };
  }

  nextAction(transfer) {
    if (transfer.purpose && transfer.purpose !== 'buysaito') {
      return null;
    }
    if (transfer.status === 'inbound_awaiting') {
      return { action: 'detect-inbound', label: 'Mark inbound payment detected' };
    }
    if (
      transfer.status === 'inbound_broadcast' &&
      transfer.inbound_tx_id === testTransferId(transfer.id)
    ) {
      return { action: 'confirm-inbound', label: 'Mark inbound payment confirmed' };
    }
    return null;
  }
}

module.exports = TransferTesting;
