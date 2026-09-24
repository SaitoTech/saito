const Transaction = require('../../../lib/saito/transaction').default;

const MODULE = 'SaitoSign';
const REQUEST = 'prepare document';

function looksLikeWebTransaction(text) {
  try {
    const json = JSON.parse(String(text || '').trim());
    return Boolean(json && typeof json.t === 'string' && json.m !== undefined);
  } catch (err) {
    return false;
  }
}

async function createPrepareTransaction(app, document) {
  const bytes = new Uint8Array(await document.file.arrayBuffer());
  const tx = new Transaction();
  tx.timestamp = Date.now();
  tx.msg = {
    module: MODULE,
    request: REQUEST,
    data: {
      name: document.file?.name || 'document.pdf',
      pdf: Buffer.from(bytes).toString('base64'),
      signers: document.signers.map((signer) => signer.name),
      fields: document.fields.map((field) => ({
        type: field.type,
        signer: document.signers.indexOf(field.signer),
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height
      }))
    }
  };
  return tx;
}

function readPrepareTransaction(app, text) {
  const raw = String(text || '').trim();
  if (!looksLikeWebTransaction(raw)) {
    throw new Error('That file is not a SaitoSign transaction.');
  }

  const tx = new Transaction();
  tx.deserialize_from_web(app, raw);
  const data = prepareData(tx);
  if (!data) {
    throw new Error('That file is not a SaitoSign transaction.');
  }
  return data;
}

function prepareData(tx) {
  const msg = typeof tx?.returnMessage === 'function' ? tx.returnMessage() : tx?.msg;
  if (!msg || msg.module !== MODULE || msg.request !== REQUEST || !msg.data) {
    return null;
  }

  const data = msg.data;
  if (typeof data.name !== 'string' || !data.name.trim() || typeof data.pdf !== 'string' || !data.pdf) {
    return null;
  }
  if (!Array.isArray(data.signers) || !data.signers.every((name) => typeof name === 'string' && name.trim())) {
    return null;
  }

  const fields = [];
  if (!Array.isArray(data.fields)) {
    return null;
  }

  for (const field of data.fields) {
    const type = field?.type;
    if (type !== 'signature' && type !== 'initial' && type !== 'date') {
      return null;
    }
    const signer = Number(field.signer);
    if (!Number.isInteger(signer) || signer < 0 || signer >= data.signers.length) {
      return null;
    }
    const page = Number(field.page);
    const x = fraction(field.x);
    const y = fraction(field.y);
    const width = fraction(field.width);
    const height = fraction(field.height);
    if (!Number.isInteger(page) || page < 1 || x === null || y === null || width === null || height === null) {
      return null;
    }
    if (width <= 0 || height <= 0) {
      return null;
    }
    fields.push({ type, signer, page, x, y, width, height });
  }

  if (!data.signers.length && fields.length) {
    return null;
  }

  return {
    name: data.name.trim(),
    pdf: data.pdf,
    signers: data.signers.map((name) => name.trim()),
    fields
  };
}

function downloadTransaction(app, tx, filename) {
  const json = tx.serialize_to_web(app);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function fraction(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    return null;
  }
  return number;
}

module.exports = {
  MODULE,
  REQUEST,
  looksLikeWebTransaction,
  createPrepareTransaction,
  readPrepareTransaction,
  downloadTransaction
};
