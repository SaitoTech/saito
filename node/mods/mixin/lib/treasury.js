const email = require('./email');
const {
  createMigrationPayoutTransaction,
  createBuySaitoPayoutTransaction,
  createTreasuryPayoutRequestTransaction,
  restoreSavedSignedTransaction
} = require('./transactions');

const PAYOUT_PURPOSES = new Set(['migration', 'buysaito', 'store-purchase']);

function configuredKeys(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((key) => String(key || '').trim()).filter(Boolean);
}

function positiveAmount(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(text) || !(Number(text) > 0)) {
    return '';
  }
  return text;
}

function positiveInteger(value) {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isSafeInteger(number) || number <= 0) {
    return 0;
  }
  return number;
}

function responseOf(result) {
  if (result && typeof result.returnMessage === 'function') {
    try {
      return result.returnMessage();
    } catch (err) {
      return null;
    }
  }
  return result && typeof result === 'object' ? result : null;
}

function requestRecipient(tx) {
  if (typeof tx?.to === 'string') {
    return tx.to.trim();
  }
  const slip = Array.isArray(tx?.to) ? tx.to[0] : null;
  return String(slip?.publicKey || slip?.add || '').trim();
}

function authorizedTreasurySigner(mod, signer) {
  const key = String(signer || '').trim();
  if (!key) {
    return false;
  }
  if (key === String(mod.publicKey || '').trim()) {
    return true;
  }
  return configuredKeys(mod.treasury_delegate_publickeys).includes(key);
}

async function selectTreasuryProvider(mod) {
  const own = String(mod.publicKey || '').trim();
  for (const key of configuredKeys(mod.treasury_provider_publickeys)) {
    if (!key || key === own) {
      continue;
    }
    if (typeof mod.app?.crypto?.isPublicKey === 'function' && !mod.app.crypto.isPublicKey(key)) {
      continue;
    }
    try {
      const peer = await mod.app?.network?.getPeer?.(key);
      if (peer) {
        return key;
      }
    } catch (err) {
      continue;
    }
  }
  return '';
}

function reject(reason) {
  return { request_status: 'rejected', reason, transfer_id: null, transfer_status: null, replayed: false };
}

async function receiveTreasuryPayout(mod, tx) {
  const message = tx?.returnMessage?.() || {};
  if (message.request !== 'mixin-issue-treasury-payout' || !message.data || typeof message.data !== 'object') {
    return reject('That transaction is not a treasury payout request.');
  }
  const signer = String(tx.from?.[0]?.publicKey || '').trim();
  if (!tx.signature || !signer || typeof tx.isValid !== 'function' || tx.isValid() !== true) {
    return reject('The payout request signature is not valid.');
  }
  const data = message.data;
  if (String(data.requester_publickey || '').trim() !== signer) {
    return reject('The payout request signer does not match the requester.');
  }
  if (!authorizedTreasurySigner(mod, signer)) {
    return reject('The payout request signer is not an authorized treasury delegate.');
  }
  if (typeof tx.isTo === 'function' && tx.isTo(mod.publicKey) !== true) {
    return reject('The payout request is not addressed to this treasury.');
  }
  const sourceTransferId = positiveInteger(data.source_transfer_id);
  const amount = positiveAmount(data.outbound_amount);
  const recipient = String(data.recipient_publickey || '').trim();
  const purpose = String(data.purpose || '').trim();
  if (!sourceTransferId || !PAYOUT_PURPOSES.has(purpose) || !amount) {
    return reject('The payout request is missing a valid transfer, purpose, or amount.');
  }
  if (typeof mod.app?.crypto?.isPublicKey !== 'function' || !mod.app.crypto.isPublicKey(recipient)) {
    return reject('The payout recipient is not a valid public key.');
  }
  if (purpose === 'store-purchase' && (!String(data.inbound_tx_hash || '').trim() || !data.payload)) {
    return reject('The store purchase request is missing its payment evidence.');
  }
  if (mod.payout_mode !== 'local' || mod.execution_mode !== 'local') {
    return {
      request_status: 'error',
      reason: 'This node is not accepting treasury payout requests.',
      transfer_id: null,
      transfer_status: null,
      replayed: false
    };
  }

  let saved;
  try {
    saved = await mod.database.recordRemoteTreasuryPayout({
      requester_publickey: signer,
      source_transfer_id: sourceTransferId,
      request_tx: typeof tx.serialize_to_web === 'function' ? tx.serialize_to_web(mod.app) : '',
      request_tx_sig: tx.signature,
      request_payload: JSON.stringify(data),
      request_id: `${signer}:${sourceTransferId}`,
      recipient_publickey: recipient,
      outbound_amount: amount,
      payload: data.payload || '',
      inbound_tx_hash: String(data.inbound_tx_hash || '').trim(),
      inbound_ticker: String(data.inbound_ticker || '').trim(),
      inbound_amount: data.inbound_amount ? String(data.inbound_amount) : ''
    });
  } catch (err) {
    return {
      request_status: 'error',
      reason: err?.message || 'The treasury request could not be recorded.',
      transfer_id: null,
      transfer_status: null,
      replayed: false
    };
  }
  if (saved?.rejected) {
    return reject(saved.reason);
  }
  if (saved?.conflict) {
    return {
      request_status: 'error',
      reason: 'That transfer already has a different signed treasury request.',
      transfer_id: saved.treasury?.transfer_id || null,
      transfer_status: null,
      replayed: false
    };
  }
  if (!saved?.transfer?.id || !saved?.treasury?.id) {
    return {
      request_status: 'error',
      reason: 'The treasury request was not recorded.',
      transfer_id: null,
      transfer_status: null,
      replayed: false
    };
  }
  return {
    request_status: 'accepted',
    reason: '',
    transfer_id: saved.transfer.id,
    transfer_status: saved.transfer.status,
    replayed: !!saved.replayed
  };
}

async function applyTreasuryResponse(mod, transferId, raw) {
  const current = (await mod.database.getTransfers({ id: transferId }))?.[0];
  if (!current || current.status === 'treasury_accepted' || current.status === 'treasury_rejected') {
    return current;
  }
  const response = responseOf(raw);
  const audit = await mod.database.findLocalTreasury(transferId);
  if (response?.request_status === 'accepted' && response.transfer_id) {
    await mod.database.updateTransfer(transferId, { status: 'treasury_accepted', last_error: '' });
    if (audit) {
      await mod.database.updateTreasury(audit.id, {
        status: 'accepted',
        remote_transfer_id: response.transfer_id || null,
        last_error: ''
      });
    }
  } else if (response?.request_status === 'rejected') {
    const reason = String(response.reason || 'Treasury rejected the payout request.');
    await mod.database.updateTransfer(transferId, { status: 'treasury_rejected', last_error: reason });
    if (audit) {
      await mod.database.updateTreasury(audit.id, { status: 'rejected', last_error: reason });
    }
  } else if (response) {
    const reason = String(response.reason || response.err || 'Treasury response was not recognized.');
    await mod.database.updateTransfer(transferId, { last_error: reason });
    if (audit) {
      await mod.database.updateTreasury(audit.id, { last_error: reason });
    }
  }
  return (await mod.database.getTransfers({ id: transferId }))?.[0] || current;
}

async function forwardTreasuryPayout(mod, row) {
  const fresh = (await mod.database.getTransfers({ id: row.id }))?.[0] || row;
  if (mod.payout_mode !== 'remote' || !PAYOUT_PURPOSES.has(fresh.purpose)) {
    return fresh;
  }
  if (
    fresh.outbound_tx_sig ||
    fresh.status === 'treasury_accepted' ||
    fresh.status === 'treasury_rejected'
  ) {
    return fresh;
  }

  let audit = await mod.database.findLocalTreasury(fresh.id);
  let tx = audit
    ? restoreSavedSignedTransaction(mod.app, audit.request_tx, audit.request_tx_sig)
    : null;
  if (audit && !tx) {
    await mod.database.updateTransfer(fresh.id, {
      status: 'treasury_submitted',
      last_error: 'The saved treasury request could not be restored.'
    });
    await mod.database.updateTreasury(audit.id, {
      last_error: 'The saved treasury request could not be restored.'
    });
    return (await mod.database.getTransfers({ id: fresh.id }))[0];
  }

  if (!tx) {
    const provider = await selectTreasuryProvider(mod);
    if (!provider) {
      await mod.database.updateTransfer(fresh.id, { last_error: 'treasury_provider_unreachable' });
      return (await mod.database.getTransfers({ id: fresh.id }))[0];
    }
    const requester = String(mod.publicKey || '').trim();
    if (!requester) {
      await mod.database.updateTransfer(fresh.id, { last_error: 'The application server has no public key.' });
      return (await mod.database.getTransfers({ id: fresh.id }))[0];
    }
    tx = await createTreasuryPayoutRequestTransaction(mod.app, provider, fresh, requester);
    const serialized = tx.serialize_to_web(mod.app);
    audit = await mod.database.saveLocalTreasuryRequest({
      requester_publickey: requester,
      source_transfer_id: Number(fresh.id),
      transfer_id: Number(fresh.id),
      request_tx: serialized,
      request_tx_sig: tx.signature,
      request_payload: JSON.stringify(tx.returnMessage?.()?.data || tx.msg?.data || {})
    });
    tx = restoreSavedSignedTransaction(mod.app, audit.request_tx, audit.request_tx_sig) || tx;
  }

  await mod.database.updateTransfer(fresh.id, {
    status: 'treasury_submitted',
    last_error: ''
  });
  const recipient = requestRecipient(tx);
  if (!recipient || typeof mod.app?.network?.sendTransactionWithCallback !== 'function') {
    await mod.database.updateTransfer(fresh.id, { last_error: 'treasury_provider_unreachable' });
    return (await mod.database.getTransfers({ id: fresh.id }))[0];
  }

  const applications = [];
  try {
    await mod.app.network.sendTransactionWithCallback(
      tx,
      (response) => {
        applications.push(applyTreasuryResponse(mod, fresh.id, response));
      },
      recipient
    );
    await Promise.all(applications);
  } catch (err) {
    await mod.database.updateTransfer(fresh.id, {
      last_error: String(err?.message || err)
    });
  }
  return (await mod.database.getTransfers({ id: fresh.id }))[0];
}

async function issueQueuedTreasuryPayout(mod, row) {
  const audit = await mod.database.findTreasuryByTransfer(row.id);
  let data = {};
  try {
    data = audit?.request_payload ? JSON.parse(audit.request_payload) : {};
  } catch (err) {
    data = {};
  }
  const sourceId = positiveInteger(data.source_transfer_id || audit?.source_transfer_id);
  const purpose = String(data.purpose || '').trim();
  if (!audit || !sourceId || !PAYOUT_PURPOSES.has(purpose)) {
    if (row.last_error !== 'The treasury payout is missing its signed request.') {
      await mod.database.updateTransfer(row.id, {
        last_error: 'The treasury payout is missing its signed request.'
      });
    }
    return (await mod.database.getTransfers({ id: row.id }))[0];
  }

  const signingRow = {
    ...row,
    id: sourceId,
    purpose,
    payload: data.payload || '',
    inbound_tx_hash: data.inbound_tx_hash || '',
    inbound_ticker: data.inbound_ticker || '',
    inbound_amount: data.inbound_amount || '',
    outbound_amount: data.outbound_amount || row.outbound_amount,
    recipient_publickey: data.recipient_publickey || row.recipient_publickey,
    requester_publickey: data.requester_publickey || row.requester_publickey
  };
  let amount = signingRow.outbound_amount;
  if (purpose === 'migration') {
    amount = mod.migration.allocationForDeposit(signingRow.outbound_amount);
    signingRow.outbound_amount = String(amount);
  }
  const required = mod.app.wallet.convertSaitoToNolan(amount);
  const available = await mod.app.wallet.getBalance();
  if (typeof available !== 'bigint' || typeof required !== 'bigint' || required <= 0n) {
    throw new Error('Invalid payout balance or amount');
  }
  if (available < required) {
    if (purpose === 'buysaito') {
      try {
        const pending = await mod.app.core?.wallet?.getPendingBalance?.();
        if (typeof pending === 'bigint' && pending >= required) {
          return row;
        }
      } catch (err) {
        console.error(`Mixin transfer ${row.id} pending balance check failed:`, err);
        return row;
      }
    }
    if (row.last_error !== 'insufficient_funds') {
      await mod.database.updateTransfer(row.id, { last_error: 'insufficient_funds' });
      if (purpose === 'migration') {
        email.sendLowBalanceEmail(mod.app, amount);
      }
    }
    return (await mod.database.getTransfers({ id: row.id }))[0];
  }

  let signed;
  let recipient = signingRow.recipient_publickey;
  if (purpose === 'migration') {
    signed = await createMigrationPayoutTransaction(mod.app, signingRow, amount);
  } else {
    try {
      const issued = await createBuySaitoPayoutTransaction(mod.app, signingRow, required);
      signed = issued.tx;
      recipient = issued.recipient;
    } catch (err) {
      if (err?.message === 'Store purchase is missing its inbound payment id or transfer id') {
        if (row.last_error !== err.message) {
          await mod.database.updateTransfer(row.id, { last_error: err.message });
        }
        return (await mod.database.getTransfers({ id: row.id }))[0];
      }
      throw err;
    }
  }
  await mod.database.updateTransfer(row.id, {
    status: 'outbound_awaiting',
    outbound_tx: signed.serialize_to_web(mod.app),
    outbound_tx_sig: signed.signature,
    outbound_amount: String(amount),
    outbound_address: recipient,
    outbound_ticker: 'SAITO',
    last_error: ''
  });
  if (purpose === 'migration') {
    email.sendStatusEmail(mod.app, 1, { ...signingRow, outbound_amount: String(amount) });
  }
  return (await mod.database.getTransfers({ id: row.id }))[0];
}

module.exports = {
  receiveTreasuryPayout,
  forwardTreasuryPayout,
  issueQueuedTreasuryPayout,
  selectTreasuryProvider
};
