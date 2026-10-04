const Transaction = require('../../../lib/saito/transaction').default;
const { copy, ACTION_TYPES } = require('./document');
const { documentHash, verifyFinalization, verifyCreatorProof } = require('./auth');

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

function flag(value) {
  return value === true;
}

function readShareMetadata(value) {
  const tier = value?.tier === 'premium' ? 'premium' : 'free';
  const tierOwner = String(value?.tier_owner || '').trim();
  const verification = value?.verification || {};
  const selectedVerification = {
    email: verification.email !== false,
    phone: tier === 'premium' && flag(verification.phone),
    photo: flag(verification.photo),
    passport: tier === 'premium' && flag(verification.passport),
    legal_review: tier === 'premium' && flag(verification.legal_review)
  };
  if (tier !== 'premium') {
    return { tier: 'free', tier_owner: tierOwner, verification: selectedVerification };
  }
  return {
    tier: 'premium',
    tier_owner: tierOwner,
    verification: selectedVerification,
    online_signing: flag(value?.online_signing),
    archive_contract: flag(value?.archive_contract)
  };
}

function shareMetadata(plan, options, tierOwner = '') {
  const selected = options || {};
  const owner = String(tierOwner || '').trim();
  const premium = plan === 'premium';
  const metadata = {
    tier: premium ? 'premium' : 'free',
    tier_owner: owner,
    verification: {
      email: flag(selected.email),
      phone: premium && flag(selected.phone),
      photo: flag(selected.photo),
      passport: premium && flag(selected.passport),
      legal_review: premium && flag(selected.legal_review)
    }
  };
  if (!premium) return metadata;
  return {
    ...metadata,
    online_signing: flag(selected.online_signing),
    archive_contract: flag(selected.archive_contract)
  };
}

async function createPrepareTransaction(app, record) {
  if (record?.creator && !verifyCreatorProof(app, record)) {
    throw new Error('The creator identity for this document could not be verified.');
  }
  if (record?.finalized && !verifyFinalization(app, record)) {
    throw new Error('The creator signature for this finalized document is invalid.');
  }
  const tx = new Transaction();
  const data = copy(record);
  data.hash = documentHash(app, data);
  if (record?.metadata) {
    data.metadata = readShareMetadata(record.metadata);
  }
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
  if ((data.finalized || data.finalization?.signature) && !verifyFinalization(app, data)) {
    throw new Error('The creator signature for this finalized document is invalid.');
  }
  if (data.creator && !verifyCreatorProof(app, data)) {
    throw new Error('The creator identity for this document could not be verified.');
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
  const record = {
    hash: String(data.hash || ''),
    creator: String(data.creator || ''),
    creatorProof: data.creatorProof && typeof data.creatorProof === 'object'
      ? JSON.parse(JSON.stringify(data.creatorProof))
      : null,
    finalized: data.finalized === true,
    finalization: data.finalization && typeof data.finalization === 'object'
      ? JSON.parse(JSON.stringify(data.finalization))
      : null,
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
  if (data.metadata && typeof data.metadata === 'object') {
    record.metadata = readShareMetadata(data.metadata);
  }
  return record;
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
  const record = {
    hash: String(data.hash || ''),
    creator: String(data.creator || ''),
    creatorProof: data.creatorProof && typeof data.creatorProof === 'object'
      ? JSON.parse(JSON.stringify(data.creatorProof))
      : null,
    finalized: data.finalized === true,
    finalization: data.finalization && typeof data.finalization === 'object'
      ? JSON.parse(JSON.stringify(data.finalization))
      : null,
    document: { name: data.name.trim(), pdf: data.pdf, page_count: 0, page_width: 0, page_height: 0 },
    users,
    actions
  };
  if (data.metadata && typeof data.metadata === 'object') {
    record.metadata = readShareMetadata(data.metadata);
  }
  return record;
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
  return list.map((entry) => {
    const next = {
      method: String(entry?.method || ''),
      publickey: String(entry?.publickey || ''),
      message: String(entry?.message || ''),
      signature: String(entry?.signature || '')
    };
    const photo = typeof entry?.photo === 'string' ? entry.photo : '';
    if (photo) {
      next.photo = photo;
    }
    const image = typeof entry?.image === 'string' ? entry.image : '';
    if (image) {
      next.image = image;
    }
    return next;
  });
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
  downloadTransaction,
  shareMetadata,
  readShareMetadata
};
