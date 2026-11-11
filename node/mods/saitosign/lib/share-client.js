const Transaction = require('../../../lib/saito/transaction').default;
const { copy } = require('./document');
const { encryptPackage, decryptPackage } = require('./envelope');
const { readPrepareTransaction } = require('./transaction');
const { createPrepareTransaction } = require('./transaction');
const { readZip } = require('./zip');
const { buildDocumentArchive, zipDocumentTransaction, zipPackage, base64ToBytes, textFromZip } = require('./archive');

function shareResponse(response) {
  if (!response) {
    return { success: false, error: 'The sharing server did not acknowledge the request.' };
  }
  if (response.err) {
    return { success: false, error: String(response.err) };
  }
  const message = typeof response.returnMessage === 'function' ? response.returnMessage() : response.msg;
  if (message && typeof message === 'object') {
    if (message.success !== undefined || message.error || message.document_id || message.link) {
      return message;
    }
    if (message.data && typeof message.data === 'object') {
      return message.data;
    }
  }
  if (typeof response === 'object' && (response.success !== undefined || response.error || response.document_id)) {
    return response;
  }
  return { success: false, error: 'SaitoSign sent a response that could not be read.' };
}

function sendShare(app, data, timeoutMs = 30000, peerKey) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(shareResponse(result));
    };
    const timer = setTimeout(() => {
      finish({
        success: false,
        error: 'The sharing server did not respond. Nothing new was confirmed. Check your connection and try again.'
      });
    }, timeoutMs);
    (async () => {
      const tx = await app.wallet.createUnsignedTransaction();
      tx.msg = { request: 'saitosign share', data };
      if (typeof tx.packData === 'function') {
        tx.packData();
      }
      if (data?.action === 'update' && data?.is_encrypted !== true) {
        if (typeof tx.sign !== 'function') {
          finish({ success: false, error: 'This upload could not be signed.' });
          return;
        }
        await tx.sign();
        if (!String(tx.signature || '').trim()) {
          finish({ success: false, error: 'This upload could not be signed.' });
          return;
        }
      }
      app.network.sendTransactionWithCallback(tx, (response) => finish(response), peerKey || undefined);
    })().catch((err) => {
      finish({ success: false, error: err?.message || 'The request could not be sent to the sharing server.' });
    });
  });
}

async function createShareTransaction(app, data) {
  const tx = await app.wallet.createUnsignedTransaction();
  tx.msg = {
    request: 'saitosign share',
    data
  };
  return tx;
}

async function signShareTransaction(tx) {
  await tx.sign();
  return tx;
}

function shareTransactionSerial(app, tx) {
  return typeof tx.serialize_to_web === 'function' ? tx.serialize_to_web(app) : '';
}

function transactionFromSerial(app, serial) {
  const tx = new Transaction();
  tx.deserialize_from_web(app, serial);
  return tx;
}

function submitShareTransaction(app, tx, timeoutMs = 120000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(shareResponse(result));
    };
    const timer = setTimeout(() => {
      finish({
        success: false,
        error: 'The sharing server did not acknowledge the document transaction. Retrying sends this same signed transaction again.'
      });
    }, timeoutMs);
    try {
      app.network.sendTransactionWithCallback(tx, (response) => finish(response));
    } catch (err) {
      finish({ success: false, error: err?.message || 'The document transaction could not be sent.' });
    }
  });
}

async function payloadForUpload(app, record, password) {
  const archive = await buildDocumentArchive(app, record);
  const packed = zipPackage(archive.bytes);
  if (!password) {
    return { is_encrypted: false, document: packed, filename: archive.filename };
  }
  return {
    is_encrypted: true,
    document: await encryptPackage(JSON.stringify(packed), password),
    filename: archive.filename
  };
}

async function stagedArchive(app, record, preparedTransaction) {
  const tx = preparedTransaction || await createPrepareTransaction(app, record);
  return zipDocumentTransaction(app, record, tx);
}

async function documentFromStored(app, stored, password) {
  let payload = stored;
  if (typeof payload === 'string') {
    const text = password ? await decryptPackage(payload, password) : payload;
    payload = String(text).trim().startsWith('{') ? JSON.parse(text) : text;
  }
  if (payload && payload.format === 'saitosign-zip' && payload.archive) {
    const entries = await readZip(base64ToBytes(payload.archive));
    const text = textFromZip(entries);
    if (!text) {
      throw new Error('The shared archive does not contain a SaitoSign document.');
    }
    return readPrepareTransaction(app, text);
  }
  return payload;
}

function shareSource(record) {
  return JSON.stringify(copy(record));
}

module.exports = {
  sendShare,
  payloadForUpload,
  createShareTransaction,
  signShareTransaction,
  shareTransactionSerial,
  transactionFromSerial,
  submitShareTransaction,
  stagedArchive,
  documentFromStored,
  shareSource,
  shareResponse
};
