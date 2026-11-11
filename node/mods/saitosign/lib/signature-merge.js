const Base58 = require('base-58');
const secp256k1 = require('secp256k1');
const { copy } = require('./document');
const {
  allActionsSigned,
  emailVerificationMessage,
  validVerification,
  verificationSatisfied,
  verifyActionSignature
} = require('./auth');

const PUBLIC_KEY_MISMATCH = 'Public key mismatch. You can only submit signatures using the identity authorized for this document.';
const DOCUMENT_MISMATCH = 'This upload does not match the shared document.';
const IDENTITY_MISSING = 'The identity verification for this signer is missing or invalid.';
const SIGNATURE_INVALID = 'A signature in this upload could not be verified.';
const SIGNATURE_CONFLICT = 'This upload contains a different signature for a field that is already signed.';
const UNSIGNED_UPLOAD = 'This upload was not signed. Sign in with the identity authorized for this document and try again.';

function fail(error) {
  return { ok: false, error, changed: false, added: [], record: null, complete: false };
}

function sameNumber(left, right) {
  return Number(left) === Number(right);
}

function sameAction(left, right) {
  return sameNumber(left?.id, right?.id)
    && left?.type === right?.type
    && sameNumber(left?.user, right?.user)
    && sameNumber(left?.page, right?.page)
    && sameNumber(left?.x, right?.x)
    && sameNumber(left?.y, right?.y)
    && sameNumber(left?.width, right?.width)
    && sameNumber(left?.height, right?.height)
    && String(left?.group || '') === String(right?.group || '');
}

function sameProof(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function documentMatches(canonical, submitted) {
  if (String(canonical?.hash || '') !== String(submitted?.hash || '') || !canonical?.hash) {
    return false;
  }
  if (String(canonical?.creator || '') !== String(submitted?.creator || '')) {
    return false;
  }
  if (!sameProof(canonical?.finalization, submitted?.finalization)) {
    return false;
  }
  if (!sameProof(canonical?.creatorProof, submitted?.creatorProof)) {
    return false;
  }
  if (JSON.stringify(canonical?.metadata || null) !== JSON.stringify(submitted?.metadata || null)) {
    return false;
  }
  const leftPdf = Array.isArray(canonical?.document?.pdf) ? canonical.document.pdf : [];
  const rightPdf = Array.isArray(submitted?.document?.pdf) ? submitted.document.pdf : [];
  if (leftPdf.length !== rightPdf.length) {
    return false;
  }
  if (String(canonical?.document?.name || '') !== String(submitted?.document?.name || '')) {
    return false;
  }
  for (let i = 0; i < leftPdf.length; i += 1) {
    if (String(leftPdf[i]?.pdf || '') !== String(rightPdf[i]?.pdf || '')) {
      return false;
    }
  }
  const leftUsers = Array.isArray(canonical?.users) ? canonical.users : [];
  const rightUsers = Array.isArray(submitted?.users) ? submitted.users : [];
  if (leftUsers.length !== rightUsers.length) {
    return false;
  }
  for (let i = 0; i < leftUsers.length; i += 1) {
    if (String(leftUsers[i]?.name || '').trim() !== String(rightUsers[i]?.name || '').trim()) {
      return false;
    }
    if (String(leftUsers[i]?.email || '').trim().toLowerCase() !== String(rightUsers[i]?.email || '').trim().toLowerCase()) {
      return false;
    }
  }
  const leftActions = Array.isArray(canonical?.actions) ? canonical.actions : [];
  const rightActions = Array.isArray(submitted?.actions) ? submitted.actions : [];
  if (leftActions.length !== rightActions.length) {
    return false;
  }
  for (let i = 0; i < leftActions.length; i += 1) {
    if (!sameAction(leftActions[i], rightActions[i])) {
      return false;
    }
  }
  return true;
}

function proofAuthorizes(app, serverKey, email, signerKey, entries) {
  const message = emailVerificationMessage(email, signerKey);
  const expectedServer = String(serverKey || '').trim();
  return (Array.isArray(entries) ? entries : []).some((entry) => {
    const entryKey = String(entry?.publickey || '').trim();
    if (!entry?.signature || entry?.message !== message) {
      return false;
    }
    if (!expectedServer || entryKey !== expectedServer) {
      return false;
    }
    return app.crypto.verifyMessage(message, entry.signature, expectedServer) === true;
  });
}

function authorizedSlot(app, canonical, submitted, signerKey, serverKey) {
  const users = Array.isArray(canonical?.users) ? canonical.users : [];
  const matches = [];
  for (let index = 0; index < users.length; index += 1) {
    const email = String(users[index]?.email || '').trim();
    const entries = []
      .concat(users[index]?.verifications || [])
      .concat(submitted?.users?.[index]?.verifications || []);
    if (proofAuthorizes(app, serverKey, email, signerKey, entries)) {
      matches.push(index);
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

function signatureIdentity(entry) {
  return [
    Number(entry?.id),
    String(entry?.signature || ''),
    String(entry?.document_hash || '')
  ].join('\0');
}

function storedSignature(list, id) {
  return (Array.isArray(list) ? list : []).find((entry) => Number(entry?.id) === Number(id)) || null;
}

function appendVerifications(app, user, incoming) {
  const current = Array.isArray(user.verifications) ? user.verifications : [];
  let added = 0;
  (Array.isArray(incoming) ? incoming : []).forEach((entry) => {
    if (!validVerification(app, entry, user)) {
      return;
    }
    const duplicate = current.some((existing) => signatureIdentity({
      id: existing.method || existing.message,
      signature: existing.signature,
      document_hash: existing.message
    }) === signatureIdentity({
      id: entry.method || entry.message,
      signature: entry.signature,
      document_hash: entry.message
    }));
    if (duplicate) {
      return;
    }
    current.push(JSON.parse(JSON.stringify(entry)));
    added += 1;
  });
  user.verifications = current;
  return added;
}

function mergeSignatureRecords(app, canonical, submitted, signerKey, serverKey) {
  const key = String(signerKey || '').trim();
  if (!key) {
    return fail(PUBLIC_KEY_MISMATCH);
  }
  if (!documentMatches(canonical, submitted)) {
    return fail(DOCUMENT_MISMATCH);
  }
  const slot = authorizedSlot(app, canonical, submitted, key, serverKey);
  if (slot == null) {
    const claimed = (Array.isArray(submitted?.users) ? submitted.users : [])
      .filter((user) => String(user?.publickey || '').trim() === key);
    return fail(claimed.length === 1 ? IDENTITY_MISSING : PUBLIC_KEY_MISMATCH);
  }

  const next = copy(canonical);
  const user = next.users[slot];
  const incomingUser = submitted.users[slot];
  const existingKey = String(user.publickey || '').trim();
  if (existingKey && existingKey !== key) {
    return fail(PUBLIC_KEY_MISMATCH);
  }
  user.publickey = key;
  const addedVerifications = appendVerifications(app, user, incomingUser?.verifications);
  if (!verificationSatisfied(app, next, user)) {
    return fail(IDENTITY_MISSING);
  }

  const foreign = foreignSignatureProblem(canonical, submitted, slot);
  if (foreign) {
    return fail(foreign);
  }

  const additions = [];
  const incoming = Array.isArray(incomingUser?.signatures) ? incomingUser.signatures : [];
  for (let i = 0; i < incoming.length; i += 1) {
    const entry = incoming[i];
    const id = Number(entry?.id);
    const signature = String(entry?.signature || '');
    if (!Number.isInteger(id) || id < 1 || !signature) {
      continue;
    }
    const documentHash = String(entry?.document_hash || '');
    const prior = storedSignature(user.signatures, id);
    if (prior) {
      if (prior.signature === signature && String(prior.document_hash || '') === documentHash) {
        continue;
      }
      return fail(SIGNATURE_CONFLICT);
    }
    const action = (next.actions || []).find((item) => Number(item.id) === id);
    if (!action || Number(action.user) !== slot) {
      return fail(PUBLIC_KEY_MISMATCH);
    }
    if (documentHash !== String(next.hash || '')) {
      return fail(DOCUMENT_MISMATCH);
    }
    additions.push({ id, signature, document_hash: documentHash });
  }

  user.signatures = (Array.isArray(user.signatures) ? user.signatures : []).concat(additions);
  for (let i = 0; i < additions.length; i += 1) {
    const action = next.actions.find((item) => Number(item.id) === additions[i].id);
    if (verifyActionSignature(app, action, user, next) !== true) {
      return fail(SIGNATURE_INVALID);
    }
  }

  if (next.hash !== canonical.hash
    || !sameProof(next.finalization, canonical.finalization)
    || !sameProof(next.creatorProof, canonical.creatorProof)) {
    return fail(DOCUMENT_MISMATCH);
  }

  return {
    ok: true,
    error: '',
    changed: additions.length > 0 || addedVerifications > 0,
    added: additions.map((entry) => entry.id),
    record: next,
    slot,
    signerName: String(user.name || '').trim(),
    complete: allActionsSigned(app, next.actions, next.users, next) === true
  };
}

function foreignSignatureProblem(canonical, submitted, slot) {
  const users = Array.isArray(submitted?.users) ? submitted.users : [];
  for (let index = 0; index < users.length; index += 1) {
    if (index === slot) {
      continue;
    }
    const incoming = Array.isArray(users[index]?.signatures) ? users[index].signatures : [];
    for (let i = 0; i < incoming.length; i += 1) {
      const entry = incoming[i];
      const signature = String(entry?.signature || '');
      if (!signature) {
        continue;
      }
      const prior = storedSignature(canonical.users[index]?.signatures, entry.id);
      if (!prior) {
        return PUBLIC_KEY_MISMATCH;
      }
      if (prior.signature !== signature || String(prior.document_hash || '') !== String(entry?.document_hash || '')) {
        return SIGNATURE_CONFLICT;
      }
    }
  }
  return '';
}

function transactionHashProof(hash, signature, publicKey) {
  const bytes = hash instanceof Uint8Array ? hash : null;
  const sigHex = String(signature || '');
  if (!bytes || bytes.length !== 32 || !/^[0-9a-fA-F]{128}$/.test(sigHex)) {
    return null;
  }
  try {
    const key = Buffer.from(Base58.decode(String(publicKey)));
    if (key.length !== 33) {
      return null;
    }
    return {
      hash: Buffer.from(bytes),
      signature: Buffer.from(sigHex, 'hex'),
      publicKey: key
    };
  } catch (err) {
    return null;
  }
}

function signedTransaction(app, hash, signature, publicKey) {
  // Saito signs hash(serialize_for_signature()). app.crypto.verifySignature
  // hashes its input again, so a real transaction hash has to be checked directly.
  const proof = transactionHashProof(hash, signature, publicKey);
  if (proof) {
    try {
      return secp256k1.verify(proof.hash, proof.signature, proof.publicKey) === true;
    } catch (err) {
      return false;
    }
  }
  return app.crypto.verifySignature(hash, signature, publicKey) === true;
}

function uploaderKey(app, tx) {
  const signature = String(tx?.signature || '').trim();
  const publicKey = String(tx?.from?.[0]?.publicKey || '').trim();
  if (!signature || !publicKey || typeof tx?.getHashForSignature !== 'function') {
    return fail(UNSIGNED_UPLOAD);
  }
  try {
    if (typeof tx.generateHashForSignature === 'function') {
      tx.generateHashForSignature();
    }
    const hash = tx.getHashForSignature();
    if (signedTransaction(app, hash, signature, publicKey) !== true) {
      return fail(UNSIGNED_UPLOAD);
    }
  } catch (err) {
    return fail(UNSIGNED_UPLOAD);
  }
  return { ok: true, publicKey, error: '' };
}

async function commitCanonicalMerge({
  app,
  signerKey,
  serverKey,
  submitted,
  readCanonical,
  writeCanonical,
  buildArchive
}) {
  let sawConflict = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readCanonical();
    const merged = mergeSignatureRecords(app, current.record, submitted, signerKey, serverKey);
    if (!merged.ok) {
      return merged;
    }
    if (!merged.changed) {
      return { ...merged, stored: false, storageHash: current.storageHash };
    }
    const packed = await buildArchive(merged.record);
    try {
      const saved = await writeCanonical(packed, current.storageHash);
      return { ...merged, stored: true, storageHash: saved.document_hash, saved };
    } catch (err) {
      if (err?.code === 'conflict') {
        sawConflict = true;
        continue;
      }
      throw err;
    }
  }
  return fail(sawConflict
    ? 'The shared document changed while your signature was being added. Try the upload again.'
    : 'The shared document could not be saved.');
}

module.exports = {
  PUBLIC_KEY_MISMATCH,
  DOCUMENT_MISMATCH,
  IDENTITY_MISSING,
  SIGNATURE_INVALID,
  SIGNATURE_CONFLICT,
  UNSIGNED_UPLOAD,
  mergeSignatureRecords,
  uploaderKey,
  commitCanonicalMerge
};
