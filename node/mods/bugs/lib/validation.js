const {
  BUG_ACTIONS,
  BUG_PRIORITIES,
  BUG_SEVERITIES,
  BUG_STATUSES,
  DEFAULT_WEIGHT,
  MAX_TITLE_LENGTH,
  MAX_WEIGHT,
  MIN_WEIGHT
} = require('./constants');

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const TRANSACTION_SIGNATURE_RE = /^[0-9a-f]{128}$/i;

function isReference(value) {
  return typeof value === 'string' && TRANSACTION_SIGNATURE_RE.test(value);
}

function isPublicKey(app, value, optional = false) {
  if (optional && (value === '' || value == null)) {
    return true;
  }
  if (typeof value !== 'string' || !value) {
    return false;
  }
  if (typeof app?.crypto?.isPublicKey === 'function') {
    return app.crypto.isPublicKey(value);
  }
  return value.length >= 32 && value.length <= 128 && BASE58_RE.test(value);
}

function normalizeCreate(data = {}) {
  const root = String(data.root_tx_sig || data.bug_id || '').trim();
  const source = String(data.source_tx_sig || root).trim();
  return {
    bug_id: root,
    root_tx_sig: root,
    source_tx_sig: source,
    title: String(data.title || '').trim(),
    status: String(data.status || 'open').toLowerCase(),
    severity: String(data.severity || 'medium').toLowerCase(),
    priority: String(data.priority || 'normal').toLowerCase(),
    weight: Number.isSafeInteger(Number(data.weight)) ? Number(data.weight) : DEFAULT_WEIGHT,
    reporter_publickey: String(data.reporter_publickey || '').trim(),
    assignee_publickey: String(data.assignee_publickey || data.assignee || '').trim(),
    note_tx_sig: String(data.note_tx_sig || '').trim(),
    previous_metadata_tx_sig: String(data.previous_metadata_tx_sig || '').trim()
  };
}

function normalizeUpdate(data = {}) {
  const action = String(data.action || '').toLowerCase();
  const normalized = {
    bug_id: String(data.bug_id || data.root_tx_sig || '').trim(),
    action,
    previous_metadata_tx_sig: String(data.previous_metadata_tx_sig || '').trim()
  };

  if (action === 'set-title') normalized.title = String(data.title || '').trim();
  if (action === 'set-status') normalized.status = String(data.status || '').toLowerCase();
  if (action === 'set-severity') normalized.severity = String(data.severity || '').toLowerCase();
  if (action === 'set-priority') normalized.priority = String(data.priority || '').toLowerCase();
  if (action === 'set-weight') normalized.weight = Number(data.weight);
  if (action === 'set-assignee') {
    normalized.assignee_publickey = String(data.assignee_publickey || data.assignee || '').trim();
  }
  return normalized;
}

function validateBugsMessage(app, message) {
  if (!message || message.module !== 'Bugs') {
    return { valid: false, error: 'Invalid module identifier' };
  }
  if (!['create bug', 'update bug'].includes(message.request)) {
    return { valid: false, error: 'Unrecognised Bugs request' };
  }
  if (!message.data || typeof message.data !== 'object' || Array.isArray(message.data)) {
    return { valid: false, error: 'Missing Bugs transaction data' };
  }

  if (message.request === 'create bug') {
    const data = normalizeCreate(message.data);
    if (!isReference(data.root_tx_sig) || !isReference(data.source_tx_sig)) {
      return { valid: false, error: 'Invalid RedSquare transaction reference' };
    }
    if (!data.title || data.title.length > MAX_TITLE_LENGTH) {
      return { valid: false, error: `Title must be 1-${MAX_TITLE_LENGTH} characters` };
    }
    if (!BUG_STATUSES.includes(data.status)) return { valid: false, error: 'Invalid status' };
    if (!BUG_SEVERITIES.includes(data.severity)) return { valid: false, error: 'Invalid severity' };
    if (!BUG_PRIORITIES.includes(data.priority)) return { valid: false, error: 'Invalid priority' };
    if (
      !Number.isSafeInteger(data.weight) ||
      data.weight < MIN_WEIGHT ||
      data.weight > MAX_WEIGHT
    ) {
      return { valid: false, error: 'Invalid weight' };
    }
    if (!isPublicKey(app, data.reporter_publickey, true)) {
      return { valid: false, error: 'Invalid reporter public key' };
    }
    if (!isPublicKey(app, data.assignee_publickey, true)) {
      return { valid: false, error: 'Invalid assignee public key' };
    }
    if (data.note_tx_sig && !isReference(data.note_tx_sig)) {
      return { valid: false, error: 'Invalid explanatory-note transaction reference' };
    }
    if (data.previous_metadata_tx_sig && !isReference(data.previous_metadata_tx_sig)) {
      return { valid: false, error: 'Invalid predecessor metadata transaction reference' };
    }
    return { valid: true, request: message.request, data };
  }

  const data = normalizeUpdate(message.data);
  if (!isReference(data.bug_id)) return { valid: false, error: 'Invalid bug reference' };
  if (data.previous_metadata_tx_sig && !isReference(data.previous_metadata_tx_sig)) {
    return { valid: false, error: 'Invalid predecessor metadata transaction reference' };
  }
  if (!BUG_ACTIONS.includes(data.action))
    return { valid: false, error: 'Unrecognised Bugs action' };
  if (data.action === 'set-title' && (!data.title || data.title.length > MAX_TITLE_LENGTH)) {
    return { valid: false, error: `Title must be 1-${MAX_TITLE_LENGTH} characters` };
  }
  if (data.action === 'set-status' && !BUG_STATUSES.includes(data.status)) {
    return { valid: false, error: 'Invalid status' };
  }
  if (data.action === 'set-severity' && !BUG_SEVERITIES.includes(data.severity)) {
    return { valid: false, error: 'Invalid severity' };
  }
  if (data.action === 'set-priority' && !BUG_PRIORITIES.includes(data.priority)) {
    return { valid: false, error: 'Invalid priority' };
  }
  if (
    data.action === 'set-weight' &&
    (!Number.isSafeInteger(data.weight) || data.weight < MIN_WEIGHT || data.weight > MAX_WEIGHT)
  ) {
    return { valid: false, error: 'Invalid weight' };
  }
  if (data.action === 'set-assignee' && !isPublicKey(app, data.assignee_publickey, true)) {
    return { valid: false, error: 'Invalid assignee public key' };
  }
  return { valid: true, request: message.request, data };
}

function containsBugHashtag(text) {
  return typeof text === 'string' && /(^|\s)#bug(?=$|[\s.,!?;:()[\]{}])/i.test(text);
}

function isRootTweetMessage(message) {
  if (message?.module !== 'RedSquare' || message?.request !== 'create tweet') return false;
  const data = message.data || {};
  return !data.parent_id && !data.parent_tweet;
}

module.exports = {
  containsBugHashtag,
  isReference,
  isRootTweetMessage,
  normalizeCreate,
  normalizeUpdate,
  validateBugsMessage
};
