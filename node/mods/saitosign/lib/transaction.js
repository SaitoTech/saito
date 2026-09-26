const Transaction = require('../../../lib/saito/transaction').default;
const { copy, ACTION_TYPES } = require('./document');
const { documentHash } = require('./auth');

const MODULE = 'SaitoSign';
const REQUEST = 'saitosign document';

function looksLikeWebTransaction(text) {
  try {
    const json = JSON.parse(String(text || '').trim());
    return Boolean(json && typeof json.t === 'string' && json.m !== undefined);
  } catch (err) {
    return false;
  }
}

async function createPrepareTransaction(app, record) {
  const tx = new Transaction();
  const data = copy(record);
  data.hash = documentHash(app, data);
  tx.timestamp = Date.now();
  tx.msg = {
    module: MODULE,
    request: REQUEST,
    data
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
  if (data.document && typeof data.document.pdf === 'string' && Array.isArray(data.actions)) {
    return readRecord(data);
  }
  return readLegacy(data);
}

function readRecord(data) {
  const pdf = data.document.pdf;
  const name = String(data.document.name || 'document.pdf').trim();
  if (!name || !pdf) {
    return null;
  }
  const users = readUsers(data.users);
  if (!users) {
    return null;
  }
  const actions = readActions(data.actions, users.length);
  if (!actions) {
    return null;
  }
  return {
    hash: String(data.hash || ''),
    document: {
      name,
      pdf,
      page_count: Number(data.document.page_count) || 0,
      page_width: Number(data.document.page_width) || 0,
      page_height: Number(data.document.page_height) || 0
    },
    users,
    actions
  };
}

function readLegacy(data) {
  if (typeof data?.name !== 'string' || !data.name.trim() || typeof data.pdf !== 'string' || !data.pdf) {
    return null;
  }
  if (!Array.isArray(data.signers) || !data.signers.every((name) => typeof name === 'string' && name.trim())) {
    return null;
  }
  const users = data.signers.map((name, index) => {
    const stored = Array.isArray(data.users) ? data.users[index] : null;
    return {
      name: name.trim(),
      email: String(stored?.email || '').trim(),
      publickey: String(stored?.publickey || stored?.publicKey || ''),
      verifications: readVerifications(stored?.verifications),
      signatures: readSignatures(stored?.signatures)
    };
  });
  const actions = [];
  if (!Array.isArray(data.fields)) {
    return null;
  }
  data.fields.forEach((field, index) => {
    const placed = readPlacement(field, users.length);
    if (!placed) {
      actions.push(null);
      return;
    }
    actions.push({ id: index + 1, ...placed });
  });
  if (actions.some((action) => !action) || (!users.length && actions.length)) {
    return null;
  }
  return {
    hash: String(data.hash || ''),
    document: { name: data.name.trim(), pdf: data.pdf, page_count: 0, page_width: 0, page_height: 0 },
    users,
    actions
  };
}

function readUsers(list) {
  if (!Array.isArray(list)) {
    return null;
  }
  const users = [];
  for (const user of list) {
    const name = String(user?.name || '').trim();
    if (!name) {
      return null;
    }
    users.push({
      name,
      email: String(user?.email || '').trim(),
      publickey: String(user?.publickey || ''),
      verifications: readVerifications(user?.verifications),
      signatures: readSignatures(user?.signatures)
    });
  }
  return users;
}

function readSignatures(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  const signatures = [];
  for (const entry of list) {
    const id = Number(entry?.id);
    const signature = String(entry?.signature || '');
    if (!Number.isInteger(id) || id < 1 || !signature) {
      continue;
    }
    signatures.push({ id, signature });
  }
  return signatures;
}

function readVerifications(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map((entry) => ({
    method: String(entry?.method || ''),
    publickey: String(entry?.publickey || ''),
    message: String(entry?.message || ''),
    signature: String(entry?.signature || '')
  }));
}

function readActions(list, userCount) {
  if (!Array.isArray(list)) {
    return null;
  }
  const actions = [];
  for (const action of list) {
    const placed = readPlacement(action, userCount);
    const id = Number(action?.id);
    if (!placed || !Number.isInteger(id) || id < 1) {
      return null;
    }
    actions.push({ id, ...placed });
  }
  if (!userCount && actions.length) {
    return null;
  }
  return actions;
}

function readPlacement(action, userCount) {
  const type = action?.type;
  if (!ACTION_TYPES[type]) {
    return null;
  }
  const user = Number(action.user !== undefined ? action.user : action.signer);
  if (!Number.isInteger(user) || user < 0 || user >= userCount) {
    return null;
  }
  const page = Number(action.page);
  const x = fraction(action.x);
  const y = fraction(action.y);
  const width = fraction(action.width);
  const height = fraction(action.height);
  if (!Number.isInteger(page) || page < 1 || x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }
  return {
    type,
    user,
    page,
    x,
    y,
    width,
    height
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
