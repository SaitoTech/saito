async function verifyEmail(app, email, publickey) {
  const message = `Request received for verification of email ${email} with publickey ${publickey}`;
  const signature = app.crypto.signMessage(message, await app.wallet.getPrivateKey());
  const link = `https://saito.io/saitosign?code=${encodeURIComponent(signature)}`;
  const text = [
    'A request was made to verify this email address for SaitoSign document signing.',
    '',
    'To verify your email address, click the link below:',
    '',
    link,
    '',
    'If you are completing verification manually, enter the following code in SaitoSign:',
    '',
    signature,
    '',
    'This verification link and code are intended only for the recipient of this email. If you did not request this verification, you can safely ignore this message.',
    '',
    'Thanks,',
    'SaitoSign'
  ].join('\n');

  const mail = app.modules.returnModule('MailRelay');
  mail.sendMail({
    to: email,
    from: 'SaitoSign <no-reply@saito.tech>',
    subject: 'Verify your email for SaitoSign',
    text,
    ishtml: false
  });

  return { message, signature };
}

async function verifyPhoto(app, publickey, image) {
  const photo = String(image || '').trim();
  const key = String(publickey || '').trim();
  if (!photo || !key) {
    throw new Error('That photo could not be saved.');
  }
  const digest = app.crypto.hash(photo);
  const message = `Photo received for verification of publickey ${key} with image ${digest}`;
  const signature = app.crypto.signMessage(message, await app.wallet.getPrivateKey());
  return {
    method: 'photo',
    publickey: key,
    message,
    signature,
    photo
  };
}

async function verifyPassport(app, publickey, image) {
  const documentImage = String(image || '').trim();
  const key = String(publickey || '').trim();
  if (!documentImage.startsWith('data:image/') || !key) {
    throw new Error('That passport image could not be saved.');
  }
  const digest = app.crypto.hash(documentImage);
  const message = `Passport image supplied for verification of publickey ${key} with image ${digest}`;
  const signature = app.crypto.signMessage(message, await app.wallet.getPrivateKey());
  return { method: 'passport', publickey: key, message, signature, image: documentImage };
}

function verifyEmailSignature(app, email, publickey, signature, serverkey) {
  const message = `Request received for verification of email ${email} with publickey ${publickey}`;
  return app.crypto.verifyMessage(message, signature, serverkey);
}

function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJSON(item)).join(',') + ']';
  }
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJSON(value[key]))
      .join(',') +
    '}'
  );
}

function pdfPayload(pdf) {
  if (!Array.isArray(pdf)) {
    return [];
  }
  return pdf.map((entry) => ({
    name: String(entry?.name || ''),
    pdf: String(entry?.pdf || '')
  }));
}

function pdfHash(app, pdf) {
  return app.crypto.hash(canonicalJSON(pdfPayload(pdf)));
}

function signingConfigurationError(record) {
  if (!pdfPayload(record?.document?.pdf).length) {
    return 'Add the PDF before finalizing this document.';
  }
  const actions = Array.isArray(record?.actions) ? record.actions : [];
  const users = Array.isArray(record?.users) ? record.users : [];
  const required = actions.filter((action) => action?.type === 'signature' || action?.type === 'initial');
  if (!required.length) {
    return 'Add at least one signature position before finalizing this document.';
  }
  for (const action of actions) {
    if (action?.type !== 'signature' && action?.type !== 'initial' && action?.type !== 'date') {
      return 'Each signing action needs a valid type.';
    }
    if (!Number.isInteger(Number(action.id)) || Number(action.id) < 1 || !placedAction(action)) {
      return 'Each signing action needs a page and position.';
    }
    if (action.type !== 'signature' && action.type !== 'initial') {
      continue;
    }
    const user = users[Number(action.user)];
    if (!user) {
      return 'Assign a signer to every signature position.';
    }
    if (!String(user.name || '').trim() || !isEmailAddress(user.email)) {
      return 'Each signer needs a name and email address.';
    }
  }
  if (!record?.metadata || typeof record.metadata !== 'object' || !record.metadata.verification) {
    return 'Choose how signers verify their identity before finalizing this document.';
  }
  return '';
}

function placedAction(action) {
  const page = Number(action?.page);
  const x = Number(action?.x);
  const y = Number(action?.y);
  const width = Number(action?.width);
  const height = Number(action?.height);
  return Number.isInteger(page) && page >= 1
    && [x, y, width, height].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && width > 0 && height > 0;
}

function actionPayload(action) {
  const next = {
    id: Number(action.id),
    type: action.type,
    user: Number(action.user),
    page: Number(action.page),
    x: Number(action.x),
    y: Number(action.y),
    width: Number(action.width),
    height: Number(action.height)
  };
  const group = String(action?.group || '').trim();
  if (group) {
    next.group = group;
  }
  return next;
}

function finalizationPayload(app, record, creator = record?.creator) {
  return {
    version: 1,
    creator: String(creator || '').trim(),
    document: {
      name: record?.document?.name || '',
      pdf_hash: pdfHash(app, record?.document?.pdf),
      page_count: Number(record?.document?.page_count) || 0,
      page_width: Number(record?.document?.page_width) || 0,
      page_height: Number(record?.document?.page_height) || 0
    },
    users: (record?.users || []).map((user) => ({ name: String(user?.name || '').trim() })),
    actions: (record?.actions || []).map(actionPayload),
    metadata: record?.metadata || null
  };
}

function creatorProofPayload(app, record, creator = record?.creator) {
  const finalized = record?.finalized === true;
  return {
    version: 1,
    creator: String(creator || '').trim(),
    pdf_hash: pdfHash(app, record?.document?.pdf),
    finalized,
    contract_hash: finalized ? app.crypto.hash(canonicalJSON(finalizationPayload(app, record, creator))) : ''
  };
}

async function createCreatorProof(app, record, creator = record?.creator) {
  const publickey = String(creator || '').trim();
  if (!publickey || !pdfPayload(record?.document?.pdf).length) {
    return false;
  }
  const privateKey = await app.wallet.getPrivateKey();
  const payload = creatorProofPayload(app, record, publickey);
  record.creatorProof = {
    version: 1,
    creator: publickey,
    finalized: payload.finalized,
    contract_hash: payload.contract_hash,
    signature: app.crypto.signMessage(canonicalJSON(payload), privateKey)
  };
  return true;
}

function verifyCreatorProof(app, record) {
  const proof = record?.creatorProof;
  const creator = String(record?.creator || '').trim();
  return Boolean(
    creator && proof?.version === 1 &&
    String(proof.creator || '').trim() === creator &&
    // Earlier SaitoSign builds signed this payload but omitted these duplicated
    // metadata fields from the proof object. Treat those legacy omissions as
    // their signed payload values so editable creator drafts remain usable.
    (proof.finalized === undefined || proof.finalized === (record.finalized === true)) &&
    (proof.contract_hash === undefined || String(proof.contract_hash) === creatorProofPayload(app, record, creator).contract_hash) &&
    proof.signature &&
    app.crypto.verifyMessage(canonicalJSON(creatorProofPayload(app, record, creator)), proof.signature, creator)
  );
}

async function finalizeDocument(app, record, creator) {
  const publickey = String(creator || '').trim();
  if (!publickey || !record || record.finalized || signingConfigurationError(record)) {
    return false;
  }
  record.creator = publickey;
  record.hash = documentHash(app, record);
  const privateKey = await app.wallet.getPrivateKey();
  const signature = app.crypto.signMessage(canonicalJSON(finalizationPayload(app, record, publickey)), privateKey);
  record.finalization = { version: 1, creator: publickey, signature };
  record.finalized = true;
  await createCreatorProof(app, record, publickey);
  record.edited = true;
  return true;
}

async function unfinalizeDocument(app, record) {
  const creator = String(record?.creator || '').trim();
  if (!record?.finalized || !creator || !walletKeys(app).includes(creator)) {
    return false;
  }
  if (!verifyCreatorProof(app, record) || !verifyFinalization(app, record)) {
    return false;
  }

  const previous = {
    finalized: record.finalized,
    finalization: record.finalization,
    creatorProof: record.creatorProof ? JSON.parse(JSON.stringify(record.creatorProof)) : null,
    hash: String(record.hash || ''),
    signatures: (record.users || []).map((user) => (user.signatures || []).map((entry) => ({ ...entry })))
  };
  record.finalized = false;
  record.finalization = null;
  record.hash = '';
  (record.users || []).forEach((user) => {
    user.signatures = [];
  });
  record.edited = true;
  const proved = await createCreatorProof(app, record, creator);
  if (!proved || record.finalized || !verifyCreatorProof(app, record)) {
    record.finalized = previous.finalized;
    record.finalization = previous.finalization;
    record.creatorProof = previous.creatorProof;
    record.hash = previous.hash;
    (record.users || []).forEach((user, index) => {
      user.signatures = previous.signatures[index] || [];
    });
    return false;
  }
  return true;
}

function verifyFinalization(app, record) {
  const finalization = record?.finalization;
  const creator = String(record?.creator || '').trim();
  return Boolean(
    record?.finalized === true &&
    finalization?.version === 1 &&
    creator &&
    String(finalization.creator || '').trim() === creator &&
    finalization.signature &&
    app.crypto.verifyMessage(canonicalJSON(finalizationPayload(app, record, creator)), finalization.signature, creator)
  );
}

function signAction(app, action, privateKey, documentHashValue) {
  const commitment = String(documentHashValue || '').trim();
  if (!commitment) {
    return null;
  }
  const payload = { ...actionPayload(action), document_hash: commitment };
  const signature = app.crypto.signMessage(canonicalJSON(payload), privateKey);
  return { id: payload.id, signature, document_hash: commitment };
}

function actionSignature(user, action) {
  const found = signatureEntry(user, action);
  return typeof found?.signature === 'string' ? found.signature : '';
}

function signatureEntry(user, action) {
  const id = Number(action?.id);
  const list = Array.isArray(user?.signatures) ? user.signatures : [];
  return list.find((entry) => Number(entry?.id) === id) || null;
}

function addSignature(app, action, privateKey, documentHashValue) {
  return signAction(app, { ...action, type: 'signature' }, privateKey, documentHashValue);
}

function addInitial(app, action, privateKey, documentHashValue) {
  return signAction(app, { ...action, type: 'initial' }, privateKey, documentHashValue);
}

function verifyActionSignature(app, action, user, record) {
  const publicKey = String(user?.publickey || '');
  const entry = signatureEntry(user, action);
  const expected = String(record?.hash || '').trim();
  if (!action || !entry?.signature || !publicKey || !commitmentIntact(app, record)) {
    return false;
  }
  if (action.type !== 'signature' && action.type !== 'initial') {
    return false;
  }
  if (String(entry.document_hash || '') !== expected) {
    return false;
  }
  const payload = { ...actionPayload(action), document_hash: expected };
  return app.crypto.verifyMessage(canonicalJSON(payload), entry.signature, publicKey);
}

function requiredActions(actions) {
  return (actions || []).filter((action) => action.type === 'signature' || action.type === 'initial');
}

function userActionsSigned(app, actions, users, userIndex, record) {
  const user = users?.[userIndex];
  return requiredActions(actions)
    .filter((action) => action.user === userIndex)
    .every((action) => verifyActionSignature(app, action, user, record));
}

function allActionsSigned(app, actions, users, record) {
  return requiredActions(actions).every((action) =>
    verifyActionSignature(app, action, users?.[action.user], record)
  );
}

function actionStatus(app, actions, users, userIndex, record) {
  const required = requiredActions(actions);
  const signed = required.filter((action) =>
    verifyActionSignature(app, action, users?.[action.user], record)
  ).length;
  const mine = required.filter((action) => action.user === userIndex);
  const mineSigned = mine.filter((action) =>
    verifyActionSignature(app, action, users?.[userIndex], record)
  ).length;
  return {
    required: required.length,
    signed,
    remaining: required.length - signed,
    mine: mine.length,
    mineSigned,
    userComplete: mineSigned === mine.length,
    complete: signed === required.length
  };
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function nameFromEmail(email) {
  return String(email)
    .split('@')[0]
    .replace(/[._+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function walletKeys(app) {
  const raw = String(app.wallet?.publicKey || '').trim();
  const keys = [];
  if (raw) {
    keys.push(raw);
  }
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length >= 64 && app.crypto?.compressPublicKey) {
    const compressed = app.crypto.compressPublicKey(raw);
    if (compressed && !keys.includes(compressed)) {
      keys.push(compressed);
    }
  }
  return keys;
}

function emailOnKey(stored) {
  const email = String(stored?.email || '').trim();
  if (isEmailAddress(email)) {
    return email;
  }
  const identifier = String(stored?.identifier || '').trim();
  if (isEmailAddress(identifier)) {
    return identifier;
  }
  return '';
}

function knownSigner(app, signers) {
  const list = Array.isArray(signers) ? signers : [];
  const keys = walletKeys(app);
  const byKey = list.filter((signer) => {
    const key = String(signer?.publickey || signer?.publicKey || '').trim();
    return Boolean(key) && keys.includes(key);
  });
  if (byKey.length === 1) {
    return byKey[0];
  }
  return null;
}

function myKeychainEmail(app) {
  if (!app.keychain) {
    return null;
  }
  for (const publickey of walletKeys(app)) {
    const email = emailOnKey(app.keychain.returnKey(publickey, true));
    if (!email) {
      continue;
    }
    const keys = walletKeys(app);
    return {
      name: nameFromEmail(email) || email,
      email,
      publickey: keys[keys.length - 1]
    };
  }
  return null;
}

function clearEmailIdentifier(app, publickey) {
  const key = String(publickey || '').trim();
  if (!app?.keychain || !key) {
    return;
  }
  const identifier = String(app.keychain.returnKey(key, true)?.identifier || '').trim();
  if (isEmailAddress(identifier)) {
    app.keychain.addKey(key, { identifier: '' });
  }
}

function rememberEmail(app, publickey, email) {
  const address = String(email || '').trim();
  const key = String(publickey || '').trim();
  if (!app.keychain || !key || !isEmailAddress(address)) {
    return;
  }
  const existing = app.keychain.returnKey(key, true);
  const data = { email: address };
  const identifier = String(existing?.identifier || '').trim();
  if (isEmailAddress(identifier)) {
    data.identifier = '';
  }
  app.keychain.addKey(key, data);
}

function emailVerificationMessage(email, publickey) {
  return `Request received for verification of email ${email} with publickey ${publickey}`;
}

function verificationMethod(entry) {
  const method = String(entry?.method || '').trim();
  if (method) {
    return method;
  }
  return String(entry?.message || '').startsWith('Request received for verification of email ')
    ? 'email'
    : '';
}

function validVerification(app, entry, user) {
  const email = String(user?.email || '').trim();
  const publickey = String(user?.publickey || '').trim();
  const method = verificationMethod(entry);
  if (!entry?.signature || !entry?.message || !entry?.publickey || !publickey) {
    return false;
  }

  if (method === 'email') {
    if (!isEmailAddress(email) || entry.message !== emailVerificationMessage(email, publickey)) {
      return false;
    }
    return app.crypto.verifyMessage(entry.message, entry.signature, entry.publickey);
  }

  if (method === 'photo') {
    const photo = String(entry.photo || '').trim();
    if (!photo || entry.publickey !== publickey) {
      return false;
    }
    const message = `Photo received for verification of publickey ${publickey} with image ${app.crypto.hash(photo)}`;
    return entry.message === message && app.crypto.verifyMessage(message, entry.signature, publickey);
  }

  if (method === 'passport') {
    const image = String(entry.image || '').trim();
    if (!image.startsWith('data:image/') || entry.publickey !== publickey) {
      return false;
    }
    const message = `Passport image supplied for verification of publickey ${publickey} with image ${app.crypto.hash(image)}`;
    return entry.message === message && app.crypto.verifyMessage(message, entry.signature, publickey);
  }

  return false;
}

function requiredVerificationIds(record) {
  const metadata = record?.metadata || {};
  const tier = metadata.tier === 'premium' ? 'premium' : 'free';
  const verification = metadata.verification || {};
  const ids = [];
  if (verification.email !== false) {
    ids.push('email');
  }
  if (verification.photo === true) {
    ids.push('photo');
  }
  if (tier === 'premium' && verification.passport === true) {
    ids.push('passport');
  }
  if (tier === 'premium' && verification.phone === true) {
    ids.push('mobile');
  }
  if (tier === 'premium' && verification.legal_review === true) {
    ids.push('thirdParty');
  }
  return ids;
}

function verificationSatisfied(app, record, user) {
  const known = verifiedMethods(app, user);
  return requiredVerificationIds(record).every((id) => known.includes(id));
}

function verifiedMethods(app, user) {
  const entries = Array.isArray(user?.verifications) ? user.verifications : [];
  const found = [];
  entries.forEach((entry) => {
    if (!validVerification(app, entry, user)) {
      return;
    }
    const method = verificationMethod(entry);
    if (method) {
      found.push(method);
    }
  });
  return found;
}

function verifiedEmail(app, user) {
  const email = String(user?.email || '').trim();
  const publickey = String(user?.publickey || '').trim();
  if (!isEmailAddress(email) || !publickey) {
    return '';
  }
  const entries = Array.isArray(user.verifications) ? user.verifications : [];
  const holds = entries.some((entry) => {
    if (!entry?.signature || !entry?.message || !entry?.publickey) {
      return false;
    }
    return validVerification(app, entry, user) && verificationMethod(entry) === 'email';
  });
  return holds ? email : '';
}

function canonicalVerification(metadata) {
  const tier = metadata?.tier === 'premium' ? 'premium' : 'free';
  const verification = metadata?.verification || {};
  const next = {
    tier,
    tier_owner: String(metadata?.tier_owner || '').trim(),
    verification: {
      email: verification.email !== false,
      phone: tier === 'premium' && verification.phone === true,
      photo: verification.photo === true,
      passport: verification.passport === true,
      legal_review: tier === 'premium' && verification.legal_review === true
    }
  };
  if (tier === 'premium') {
    next.online_signing = metadata.online_signing === true;
    next.archive_contract = metadata.archive_contract === true;
  }
  return next;
}

function documentCommitment(record) {
  const signers = (record?.users || []).map((user, index) => ({
    index,
    name: String(user?.name || '').trim(),
    email: String(user?.email || '').trim().toLowerCase()
  }));
  const actions = (record?.actions || []).map((action) => actionPayload(action))
    .sort((left, right) => left.id - right.id);
  return {
    version: 1,
    creator: String(record?.creator || '').trim(),
    document: {
      name: String(record?.document?.name || ''),
      pdf: pdfPayload(record?.document?.pdf),
      page_count: Number(record?.document?.page_count) || 0,
      page_width: Number(record?.document?.page_width) || 0,
      page_height: Number(record?.document?.page_height) || 0
    },
    signers,
    actions,
    verification: canonicalVerification(record?.metadata)
  };
}

function documentHash(app, record) {
  return app.crypto.hash(canonicalJSON(documentCommitment(record)));
}

function commitmentIntact(app, record) {
  const stored = String(record?.hash || '').trim();
  return Boolean(record?.finalized && stored && stored === documentHash(app, record));
}

function documentFullyVerified(app, record) {
  const required = requiredActions(record?.actions);
  return Boolean(
    required.length > 0 &&
    commitmentIntact(app, record) &&
    verifyFinalization(app, record) &&
    allActionsSigned(app, record.actions, record.users, record)
  );
}

function documentUnchanged(app, record) {
  const hash = String(record?.hash || '');
  return Boolean(hash) && hash === documentHash(app, record);
}

function rememberVerifiedEmails(app, record) {
  const users = Array.isArray(record?.users) ? record.users : [];
  users.forEach((user) => {
    const email = verifiedEmail(app, user);
    if (email) {
      rememberEmail(app, user.publickey, email);
    }
  });
}

module.exports = {
  verifyEmail,
  verifyPhoto,
  verifyPassport,
  verifyEmailSignature,
  addSignature,
  addInitial,
  verifyActionSignature,
  finalizationPayload,
  createCreatorProof,
  verifyCreatorProof,
  finalizeDocument,
  unfinalizeDocument,
  verifyFinalization,
  documentHash,
  documentUnchanged,
  commitmentIntact,
  documentFullyVerified,
  signingConfigurationError,
  userActionsSigned,
  allActionsSigned,
  actionStatus,
  myKeychainEmail,
  knownSigner,
  clearEmailIdentifier,
  rememberEmail,
  rememberVerifiedEmails,
  verifiedMethods,
  verifiedEmail,
  verificationSatisfied,
  validVerification
};
