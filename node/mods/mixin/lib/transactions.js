const Transaction = require('../../../lib/saito/transaction').default;

function messageOf(tx) {
  try {
    return typeof tx?.returnMessage === 'function' ? tx.returnMessage() : null;
  } catch (err) {
    return null;
  }
}

async function createMigrationPayoutTransaction(app, row, amount) {
  const recipient = row.recipient_publickey;
  const tx = await app.wallet.createUnsignedTransactionWithDefaultFee(
    recipient,
    app.wallet.convertSaitoToNolan(amount)
  );
  tx.msg = {
    module: 'Mixin',
    request: 'migration issuance',
    amount,
    hash: row.inbound_tx_hash || String(row.id),
    data: {
      id: row.id,
      requester_publickey: row.requester_publickey,
      recipient_publickey: row.recipient_publickey,
      inbound_ticker: row.inbound_ticker,
      inbound_amount: row.inbound_amount,
      outbound_amount: String(amount)
    }
  };
  await tx.sign();
  return tx;
}

function receiveMigrationPayoutTransaction(tx, row) {
  if (!tx || !row || !tx.signature || tx.signature !== row.outbound_tx_sig) {
    return false;
  }
  const message = messageOf(tx);
  if (!message) {
    return true;
  }
  return message.module === 'Mixin' && message.request === 'migration issuance';
}

// inbound_tx_hash is the Mixin transaction hash recorded when the deposit was
// claimed. It identifies that external payment. inbound_tx_id is only the
// snapshot or deposit id from whichever observation was read, so it is not used.
// transfers.id is the persisted primary key of the credited row.
function storeIssuanceIdentifiers(row) {
  const inbound =
    typeof row?.inbound_tx_hash === 'string' ? row.inbound_tx_hash.trim() : '';
  const rawId = row?.id;
  const transferId =
    typeof rawId === 'number'
      ? rawId
      : typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId)
        ? Number(rawId)
        : NaN;
  if (!inbound || !Number.isSafeInteger(transferId) || transferId <= 0) {
    return null;
  }
  return {
    inbound_payment_uuid: inbound,
    transfer_uuid: String(transferId)
  };
}

async function createBuySaitoPayoutTransaction(app, row, amountNolan) {
  let recipient = row.recipient_publickey;
  let preserved = null;
  if (row.payload) {
    const userTx = new Transaction();
    userTx.deserialize_from_web(app, row.payload);
    preserved = userTx.returnMessage();
    if (preserved?.p2sh_address) {
      const address = preserved.p2sh_address;
      recipient =
        address.length === 66 && address.startsWith('00') ? app.crypto.toBase58(address) : address;
    }
  }
  const storePurchase = preserved?.module === 'Store' && preserved?.request === 'purchase-asset';
  const identifiers = storePurchase ? storeIssuanceIdentifiers(row) : null;
  if (storePurchase && !identifiers) {
    throw new Error('Store purchase is missing its inbound payment id or transfer id');
  }
  const tx = await app.wallet.createUnsignedTransactionWithDefaultFee(recipient, amountNolan);
  if (storePurchase) {
    tx.msg = { ...preserved, ...identifiers };
  } else if (preserved) {
    tx.msg = preserved;
  } else {
    tx.msg = {
      module: 'BuySaito',
      request: 'buysaito issuance',
      data: {
        id: row.id,
        requester_publickey: row.requester_publickey,
        recipient_publickey: row.recipient_publickey,
        inbound_ticker: row.inbound_ticker,
        inbound_amount: row.inbound_amount,
        outbound_amount: row.outbound_amount
      },
      memo: `${row.inbound_amount} ${row.inbound_ticker}`
    };
  }
  await tx.sign();
  return { tx, recipient };
}

function receiveBuySaitoPayoutTransaction(tx, row) {
  if (!tx || !row || !tx.signature || tx.signature !== row.outbound_tx_sig) {
    return false;
  }
  const message = messageOf(tx);
  if (!message || row.payload) {
    return true;
  }
  return message.module === 'BuySaito' && message.request === 'buysaito issuance';
}

function restoreSavedSignedTransaction(app, serialized, expectedSignature) {
  const tx = new Transaction();
  tx.deserialize_from_web(app, serialized);
  if (!tx.signature || tx.signature !== expectedSignature) {
    return null;
  }
  return tx;
}

module.exports = {
  createMigrationPayoutTransaction,
  receiveMigrationPayoutTransaction,
  createBuySaitoPayoutTransaction,
  receiveBuySaitoPayoutTransaction,
  restoreSavedSignedTransaction,
  storeIssuanceIdentifiers
};
