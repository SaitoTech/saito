const SHARE_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function recipientList(values) {
  const seen = new Set();
  const recipients = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const email = normalizeEmail(value?.email == null ? value : value.email);
    if (!email || seen.has(email)) {
      return;
    }
    seen.add(email);
    recipients.push({
      email,
      signerIndex: Number.isInteger(value?.signerIndex) ? value.signerIndex : null
    });
  });
  return recipients;
}

function invalidRecipients(recipients) {
  return recipientList(recipients).filter((recipient) => !isEmailAddress(recipient.email));
}

function sharePurpose(record) {
  const actions = Array.isArray(record?.actions) ? record.actions : [];
  const users = Array.isArray(record?.users) ? record.users : [];
  const required = actions.filter((action) => action.type === 'signature' || action.type === 'initial');
  if (!required.length) {
    return 'access';
  }
  const complete = required.every((action) => {
    const user = users[action.user];
    const signatures = Array.isArray(user?.signatures) ? user.signatures : [];
    return signatures.some((entry) => Number(entry?.id) === Number(action.id) && entry.signature);
  });
  return complete ? 'access' : 'sign';
}

function importFailure(kind) {
  if (kind === 'invalid') {
    return 'The archive is incomplete or invalid. Ask the sender for a new SaitoSign ZIP export, then import that file.';
  }
  if (kind === 'unsupported') {
    return 'This archive is not a supported SaitoSign document. Export it from SaitoSign and import that ZIP file.';
  }
  return 'Document could not be imported. Check that you selected the ZIP file exported from SaitoSign, then try again.';
}

function versionsConflict(storedHash, expectedHash) {
  return String(storedHash || '') !== String(expectedHash || '');
}

function retentionExpiry({ mode, current, finalizedAt, retentionMs, now }) {
  const retention = Number(retentionMs);
  if (mode === 'clear') {
    return null;
  }
  if (mode === 'retain') {
    return current == null ? null : Number(current);
  }
  if (mode === 'final') {
    const start = Date.parse(finalizedAt);
    if (!Number.isFinite(start) || !Number.isFinite(retention)) {
      throw new Error('SaitoSign finalization time is invalid.');
    }
    return Math.trunc(start) + retention;
  }
  if (!Number.isFinite(now) || !Number.isFinite(retention)) {
    throw new Error('SaitoSign document expiry is invalid.');
  }
  return Math.trunc(now) + retention;
}

function shareProtectionError(view) {
  if (!view?.protect) {
    return '';
  }
  const password = String(view.password || '');
  if (!password) {
    return 'Enter a password, or turn password protection off.';
  }
  if (password !== String(view.confirm || '')) {
    return 'The two passwords do not match. Enter the same password in both fields.';
  }
  return '';
}

function shareLink(origin, documentId, token) {
  const base = String(origin || '').replace(/\/+$/, '');
  if (!base || !documentId || !token) {
    return '';
  }
  return `${base}/saitosign?share=${encodeURIComponent(documentId)}&token=${encodeURIComponent(token)}`;
}

function recipientLink(origin, documentId, token, verifyToken) {
  const link = shareLink(origin, documentId, token);
  const secret = String(verifyToken || '').trim();
  if (!link || !secret) {
    return link;
  }
  return `${link}#verify=${encodeURIComponent(secret)}`;
}

function sameToken(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length || !a) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

module.exports = {
  SHARE_RETENTION_MS,
  normalizeEmail,
  isEmailAddress,
  recipientList,
  invalidRecipients,
  sharePurpose,
  shareProtectionError,
  importFailure,
  versionsConflict,
  retentionExpiry,
  shareLink,
  recipientLink,
  sameToken
};
