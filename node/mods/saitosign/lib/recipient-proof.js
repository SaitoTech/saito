const { copy } = require('./document');
const { emailVerificationMessage, validVerification, verifyActionSignature } = require('./auth');

function sameEmail(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function signerIndexForEmail(record, email) {
  const users = Array.isArray(record?.users) ? record.users : [];
  const matches = [];
  users.forEach((user, index) => {
    if (sameEmail(user?.email, email)) {
      matches.push(index);
    }
  });
  return matches.length === 1 ? matches[0] : -1;
}

function acceptableEmailProof(app, proof) {
  const email = String(proof?.email || '').trim();
  const publickey = String(proof?.publickey || '').trim();
  const serverKey = String(proof?.serverKey || '').trim();
  const message = String(proof?.message || '');
  const signature = String(proof?.signature || '');
  if (!email || !publickey || !serverKey || !signature || !message) {
    return false;
  }
  if (message !== emailVerificationMessage(email, publickey)) {
    return false;
  }
  return app?.crypto?.verifyMessage(message, signature, serverKey) === true;
}

function emailEntry(item) {
  const method = String(item?.method || '').trim();
  if (method === 'email') {
    return true;
  }
  return !method && String(item?.message || '').startsWith('Request received for verification of email ');
}

function applyEmailProof(record, proof, app) {
  const email = String(proof?.email || '').trim();
  const publickey = String(proof?.publickey || '').trim();
  const index = signerIndexForEmail(record, email);
  if (!record || index < 0 || !publickey) {
    return { status: 'missing', index };
  }
  if (!acceptableEmailProof(app, proof)) {
    return { status: 'invalid', index };
  }
  const user = record.users[index];
  const existing = String(user.publickey || '').trim();
  if (existing && existing !== publickey) {
    return {
      status: 'mismatch',
      index,
      email,
      name: String(user.name || '').trim()
    };
  }
  user.publickey = publickey;
  const entry = {
    method: 'email',
    publickey: String(proof.serverKey || '').trim(),
    message: String(proof.message || ''),
    signature: String(proof.signature || ''),
    returned: true
  };
  const kept = (Array.isArray(user.verifications) ? user.verifications : []).filter((item) => !emailEntry(item));
  kept.push(entry);
  user.verifications = kept;
  record.edited = true;
  return { status: 'applied', index };
}

function restartSignerWallet(record, index) {
  const users = Array.isArray(record?.users) ? record.users : [];
  const user = users[index];
  if (!user) {
    return false;
  }
  user.publickey = '';
  user.signatures = [];
  user.verifications = [];
  record.edited = true;
  return true;
}

function sameSignature(left, right) {
  return Number(left?.id) === Number(right?.id)
    && String(left?.signature || '') === String(right?.signature || '')
    && String(left?.document_hash || '') === String(right?.document_hash || '');
}

function restoreWalletProgress(app, serverRecord, localRecord, keys) {
  if (!serverRecord || !localRecord) {
    return serverRecord;
  }
  if (!serverRecord.hash || String(serverRecord.hash) !== String(localRecord.hash || '')) {
    return serverRecord;
  }
  const keyset = new Set((Array.isArray(keys) ? keys : []).map((key) => String(key || '').trim()).filter(Boolean));
  if (!keyset.size) {
    return serverRecord;
  }
  const next = copy(serverRecord);
  const localUsers = Array.isArray(localRecord.users) ? localRecord.users : [];
  let changed = false;
  next.users.forEach((user, index) => {
    const local = localUsers[index];
    if (!local || !sameEmail(user.email, local.email)) {
      return;
    }
    const localKey = String(local.publickey || '').trim();
    if (!keyset.has(localKey)) {
      return;
    }
    const remoteKey = String(user.publickey || '').trim();
    if (remoteKey && remoteKey !== localKey) {
      return;
    }
    if (!remoteKey) {
      user.publickey = localKey;
      changed = true;
    }
    const localVerifications = Array.isArray(local.verifications) ? local.verifications : [];
    const verifications = Array.isArray(user.verifications) ? user.verifications : [];
    localVerifications.forEach((entry) => {
      const stored = JSON.parse(JSON.stringify(entry));
      if (!validVerification(app, stored, user)) {
        return;
      }
      const duplicate = verifications.some((existing) => {
        return existing?.signature === stored.signature && existing?.message === stored.message;
      });
      if (duplicate) {
        return;
      }
      verifications.push(stored);
      changed = true;
    });
    user.verifications = verifications;
    const signatures = Array.isArray(user.signatures) ? user.signatures : [];
    const localSignatures = Array.isArray(local.signatures) ? local.signatures : [];
    localSignatures.forEach((entry) => {
      if (signatures.some((existing) => sameSignature(existing, entry))) {
        return;
      }
      const stored = {
        id: Number(entry?.id),
        signature: String(entry?.signature || ''),
        document_hash: String(entry?.document_hash || '')
      };
      signatures.push(stored);
      const action = (next.actions || []).find((item) => Number(item.id) === stored.id);
      if (verifyActionSignature(app, action, user, next) !== true) {
        signatures.pop();
        return;
      }
      changed = true;
    });
    user.signatures = signatures;
  });
  return changed ? next : serverRecord;
}

module.exports = {
  signerIndexForEmail,
  acceptableEmailProof,
  applyEmailProof,
  restartSignerWallet,
  restoreWalletProgress
};
