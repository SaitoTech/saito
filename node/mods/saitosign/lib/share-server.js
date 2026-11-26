const { createHash, randomBytes } = require('crypto');
const { configuredPublicOrigin } = require('./recovery');
const { SHARE_RETENTION_MS, recipientList, invalidRecipients, normalizeEmail, shareLink, recipientLink, sameToken } = require('./share-protocol');
const { allActionsSigned, signEmailVerification, createServerFinalization } = require('./auth');
const {
  commitCanonicalMerge,
  uploaderKey,
  PUBLIC_KEY_MISMATCH
} = require('./signature-merge');

function hashRecipientSecret(secret) {
  return createHash('sha256').update(String(secret || '')).digest('hex');
}

function assignRecipientSecrets(recipients) {
  return (Array.isArray(recipients) ? recipients : []).map((recipient) => {
    if (recipient?.verify_secret && recipient?.verify_hash) {
      return recipient;
    }
    const verify_secret = randomBytes(32).toString('hex');
    return {
      ...recipient,
      verify_secret,
      verify_hash: hashRecipientSecret(verify_secret)
    };
  });
}

function recipientForSecret(recipients, secret) {
  const presented = String(secret || '').trim();
  if (!presented) {
    return null;
  }
  const hash = hashRecipientSecret(presented);
  const matches = (Array.isArray(recipients) ? recipients : []).filter((recipient) => {
    return recipient?.verify_hash && sameToken(recipient.verify_hash, hash);
  });
  return matches.length === 1 ? matches[0] : null;
}

function shareError(error) {
  return { success: false, error };
}

function storedShare(mod, share, stored, reused) {
  return {
    success: true,
    reused: reused === true,
    document_id: share.document_id,
    token: share.token,
    document_hash: stored.document_hash,
    expires_at: stored.expires_at,
    link: shareLink(configuredPublicOrigin(mod.app), share.document_id, share.token)
  };
}

async function existingShare(mod, clientKey) {
  if (!clientKey || typeof mod.database.readShareByClientKey !== 'function') {
    return null;
  }
  const share = await mod.database.readShareByClientKey(clientKey).catch(() => null);
  if (!share) {
    return null;
  }
  const stored = await mod.database.getDocument(share.document_id).catch(() => null);
  if (!stored || stored.expired) {
    return null;
  }
  return storedShare(mod, share, stored, true);
}

function mailFailure(err) {
  return String(err?.message || err || 'The mail relay did not accept the message.')
    .replace(/\s+/g, ' ')
    .replace(/SG\.[A-Za-z0-9._-]+/g, 'SG.[redacted]')
    .trim()
    .slice(0, 300);
}

async function createShare(mod, data) {
  const recipients = recipientList(data.recipients);
  if (!recipients.length || invalidRecipients(recipients).length) {
    return shareError('Enter a valid email address for each recipient.');
  }
  const clientKey = String(data.client_key || '').trim();
  const already = await existingShare(mod, clientKey);
  if (already) {
    return already;
  }
  const purpose = data.purpose === 'access' ? 'access' : 'sign';
  const encrypted = data.is_encrypted === true;
  const payload = encrypted ? String(data.document || '') : data.document;
  if (encrypted && !payload) {
    return shareError('The encrypted document was not included in the upload.');
  }
  if (payload) {
    const omitted = await unfinalizedEmailOmitted(mod, payload, encrypted ? String(data.password || '') : '');
    if (omitted) {
      return shareError('Email verification is required and cannot be removed.');
    }
  }
  let stored;
  try {
    stored = await mod.database.saveDocument(payload, {
      isEncrypted: encrypted,
      expiresAt: null,
      tier: data.tier === 'premium' ? 'premium' : 'free'
    });
  } catch (err) {
    const detail = String(err?.message || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    return shareError(detail
      ? `${detail} Nothing was shared. Your recipients and password are still on this screen. Try again.`
      : 'SaitoSign could not store this document. Nothing was shared. Your recipients and password are still on this screen. Try again.');
  }
  const share = {
    document_id: stored.document_id,
    token: randomBytes(32).toString('hex'),
    purpose,
    originator_name: String(data.originator_name || '').trim() || 'A SaitoSign user',
    originator_email: String(data.originator_email || '').trim(),
    document_name: String(data.document_name || 'document').trim() || 'document',
    recipients,
    created_at: Date.now(),
    client_key: clientKey
  };
  try {
    await mod.database.saveShare(share);
  } catch (err) {
    const raced = await existingShare(mod, clientKey);
    try {
      await mod.database.deleteDocument(stored.document_id);
    } catch (cleanup) {}
    if (raced) {
      return raced;
    }
    const detail = mailFailure(err);
    return shareError(detail
      ? `SaitoSign could not save the recipient list: ${detail}. Nothing was shared. Try again.`
      : 'SaitoSign could not save the recipient list. Nothing was shared. Try again.');
  }
  return storedShare(mod, share, stored, false);
}

async function fetchShare(mod, data) {
  const id = String(data.document_id || '').trim();
  const share = await mod.database.readShare(id).catch(() => null);
  if (!share || !sameToken(share.token, data.token)) {
    return shareError('This sharing link is not valid. Ask the sender for a new link.');
  }
  let stored;
  try {
    stored = await mod.database.getDocument(id);
  } catch (err) {
    return shareError(err?.code === 'expired' ? 'This shared document has expired.' : 'The shared document could not be read.');
  }
  if (!stored || stored.expired) {
    return shareError('This shared document has expired. Server-assisted copies are kept for about two days.');
  }
  return {
    success: true,
    document_id: id,
    document_hash: stored.document_hash,
    is_encrypted: stored.is_encrypted,
    expires_at: stored.expires_at,
    purpose: share.purpose,
    originator_name: share.originator_name,
    document_name: share.document_name,
    document: stored.is_encrypted ? stored.document_data : stored.document
  };
}

const mergeQueues = new Map();

function enqueueMerge(id, task) {
  const previous = mergeQueues.get(id) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  mergeQueues.set(id, run);
  return run.finally(() => {
    if (mergeQueues.get(id) === run) {
      mergeQueues.delete(id);
    }
  });
}

async function updateShare(mod, data, tx, password) {
  const id = String(data.document_id || '').trim();
  const share = await mod.database.readShare(id).catch(() => null);
  if (!share || !sameToken(share.token, data.token)) {
    return shareError('This sharing link is not valid. Ask the sender for a new link.');
  }
  return enqueueMerge(id, () => mergeShare(mod, id, share, data, tx, password));
}

async function serverIdentity(mod) {
  let serverKey = String(mod.publicKey || '').trim();
  if (!serverKey && typeof mod.app?.wallet?.getPublicKey === 'function') {
    serverKey = String(await mod.app.wallet.getPublicKey()).trim();
  }
  return serverKey;
}

async function mergeShare(mod, id, share, data, tx, password) {
  const encrypted = data.is_encrypted === true;
  const signer = uploaderKey(mod.app, tx);
  if (!signer.ok) {
    return shareError(signer.error);
  }
  const serverKey = await serverIdentity(mod);
  if (!serverKey) {
    return shareError('SaitoSign could not confirm the identity server for this signature.');
  }
  if (encrypted && !password) {
    return shareError('Enter the document password so SaitoSign can validate this encrypted document.');
  }
  let submitted;
  try {
    const { documentFromStored } = require('./share-client');
    submitted = await documentFromStored(mod.app, data.document, encrypted ? password : '');
  } catch (err) {
    if (err?.code === 'password') {
      return shareError('The password could not unlock this document.');
    }
    return shareError(err?.message || 'The signed document could not be read.');
  }
  let merged;
  try {
    const { buildDocumentArchive, zipPackage } = require('./archive');
    const { encryptPackage } = require('./envelope');
    const { documentFromStored } = require('./share-client');
    merged = await commitCanonicalMerge({
      app: mod.app,
      signerKey: signer.publicKey,
      serverKey,
      submitted,
      restart: data.restart_signer === true,
      finalize: (record) => createServerFinalization(mod.app, record, serverKey),
      readCanonical: async () => {
        const stored = await mod.database.getDocument(id);
        if (!stored) {
          const missing = new Error('SaitoSign document was not found.');
          missing.code = 'not_found';
          throw missing;
        }
        if (stored.expired) {
          const expired = new Error('This shared document has expired.');
          expired.code = 'expired';
          throw expired;
        }
        if (Boolean(stored.is_encrypted) !== encrypted) {
          const invalid = new Error('The stored document type does not match this update.');
          invalid.code = 'invalid';
          throw invalid;
        }
        const payload = stored.is_encrypted ? stored.document_data : stored.document;
        return {
          record: await documentFromStored(mod.app, payload, encrypted ? password : ''),
          storageHash: stored.document_hash
        };
      },
      buildArchive: async (record) => {
        const archive = await buildDocumentArchive(mod.app, record);
        const packed = zipPackage(archive.bytes);
        if (!encrypted) {
          return packed;
        }
        return encryptPackage(JSON.stringify(packed), password);
      },
      writeCanonical: (packed, expectedHash, meta) => {
        const expiry = meta?.finalizedNow ? 'final' : 'clear';
        const writeOptions = {
          expectedHash,
          expiry,
          finalizedAt: meta?.finalizedAt,
          retentionMs: SHARE_RETENTION_MS
        };
        if (encrypted) {
          return mod.database.updateSharedPayload(id, packed, { ...writeOptions, isEncrypted: true });
        }
        return mod.database.saveMergedPayload(id, packed, writeOptions);
      }
    });
  } catch (err) {
    return shareUpdateError(err);
  }
  if (!merged.ok) {
    return shareError(merged.error);
  }
  const complete = merged.complete === true && allActionsSigned(mod.app, merged.record.actions, merged.record.users, merged.record) === true;
  let completionEmail = null;
  let notification = { attempted: false, failed: false };
  if (merged.stored && merged.finalizedNow) {
    const party = merged.record?.users?.[merged.slot];
    completionEmail = await sendCompletionEmail(mod, share, merged.record, party?.email);
    notification = {
      attempted: true,
      failed: completionEmail?.failed === true
    };
  } else if (merged.stored) {
    const party = merged.record?.users?.[merged.slot];
    notification = await notifySignatureMerge(mod, share, {
      complete,
      signerName: merged.signerName,
      signerEmail: party?.email
    });
  }
  return {
    success: true,
    document_id: id,
    document_hash: merged.storageHash,
    is_encrypted: encrypted,
    merged: merged.stored === true,
    already_present: merged.stored !== true,
    added: merged.added,
    complete,
    finalized: Boolean(merged.record?.serverFinalization) && complete,
    completion_email_sent: completionEmail?.sent || 0,
    notification_attempted: notification?.attempted === true,
    notification_failed: notification?.failed === true,
    stages: ['uploaded', 'verified', 'validated', 'merged', 'saved']
  };
}

function shareUpdateError(err) {
  if (err?.code === 'password') {
    return shareError('The password could not unlock this document.');
  }
  if (err?.code === 'conflict') {
    return shareError('conflict');
  }
  if (err?.code === 'expired') {
    return shareError('This shared document has expired.');
  }
  if (err?.code === 'invalid') {
    return shareError(err.message);
  }
  return shareError(err?.message || 'The updated document could not be stored. Try the upload again.');
}

function notificationRecipients(share, signerEmail) {
  const seen = new Set();
  const emails = [];
  const add = (value) => {
    const email = normalizeEmail(value);
    if (!email || seen.has(email)) {
      return;
    }
    seen.add(email);
    emails.push(email);
  };
  const recipients = Array.isArray(share?.recipients) ? share.recipients : [];
  recipients.forEach((recipient) => add(recipient?.email));
  add(share?.originator_email);
  add(signerEmail);
  return emails;
}

async function sendCompletionEmail(mod, share, record, signerEmail) {
  try {
    const mail = mod.app.modules.returnModule('MailRelay');
    if (!mail || typeof mail.sendMail !== 'function') {
      console.error('SaitoSign completion email was not sent: the mail relay is unavailable.');
      return { sent: 0, failed: true };
    }
    const link = shareLink(configuredPublicOrigin(mod.app), share.document_id, share.token);
    const subject = 'Your SaitoSign document has been completed';
    const text = [
      'Your document has been successfully completed.',
      '',
      'All required parties have provided their signatures, and SaitoSign has cryptographically finalized the document.',
      '',
      'You can download your completed copy using the link below.',
      '',
      link,
      '',
      'Please note that the document will remain available for download for two days, after which it will be permanently deleted from our server.',
      '',
      'Please download and retain your own copy.'
    ].join('\n');
    const targets = notificationRecipients(share, signerEmail);
    (Array.isArray(record?.users) ? record.users : []).forEach((user) => {
      const email = normalizeEmail(user?.email);
      if (email && !targets.includes(email)) {
        targets.push(email);
      }
    });
    let sent = 0;
    for (let i = 0; i < targets.length; i += 1) {
      try {
        await mail.sendMail({
          to: targets[i],
          from: 'SaitoSign <no-reply@saito.tech>',
          subject,
          text,
          ishtml: false
        });
        sent += 1;
      } catch (err) {
        console.error(mailFailure(err));
      }
    }
    if (sent !== targets.length) {
      console.error(`SaitoSign completion email reached ${sent} of ${targets.length} parties. It was not retried.`);
    }
    return { sent, failed: sent !== targets.length };
  } catch (err) {
    console.error(mailFailure(err));
    return { sent: 0, failed: true };
  }
}

async function notifySignatureMerge(mod, share, details) {
  const targets = notificationRecipients(share, details.signerEmail);
  if (!targets.length) {
    return { attempted: false, failed: false };
  }
  try {
    const mail = mod.app.modules.returnModule('MailRelay');
    if (!mail || typeof mail.sendMail !== 'function') {
      return { attempted: true, failed: true };
    }
    const link = shareLink(configuredPublicOrigin(mod.app), share.document_id, share.token);
    const name = String(details.signerName || '').trim() || 'A signer';
    const subject = `${name} completed the required signatures on ${share.document_name}`;
    const text = [
      `${name} has completed the required signatures on "${share.document_name}".`,
      '',
      'Open the latest version:',
      link
    ].join('\n');
    let sent = 0;
    for (let i = 0; i < targets.length; i += 1) {
      try {
        await mail.sendMail({
          to: targets[i],
          from: 'SaitoSign <no-reply@saito.tech>',
          subject,
          text,
          ishtml: false
        });
        sent += 1;
      } catch (err) {
        console.error(mailFailure(err));
      }
    }
    return { attempted: true, failed: sent !== targets.length };
  } catch (err) {
    console.error(mailFailure(err));
    return { attempted: true, failed: true };
  }
}

async function unfinalizedEmailOmitted(mod, payload, password) {
  try {
    const { documentFromStored } = require('./share-client');
    const record = await documentFromStored(mod.app, payload, password || '');
    return record?.finalized !== true && record?.metadata?.verification?.email === false;
  } catch (err) {
    return false;
  }
}

async function ensureRecipientSecrets(mod, share) {
  const recipients = assignRecipientSecrets(share.recipients);
  const changed = recipients.some((recipient, index) => recipient !== share.recipients[index]);
  if (!changed) {
    return share;
  }
  await mod.database.updateShareRecipients(share.document_id, recipients);
  return { ...share, recipients };
}

async function inviteShare(mod, data) {
  const id = String(data.document_id || '').trim();
  const storedShare = await mod.database.readShare(id).catch(() => null);
  if (!storedShare || !sameToken(storedShare.token, data.token)) {
    return shareError('This sharing link is not valid.');
  }
  let share;
  try {
    share = await ensureRecipientSecrets(mod, storedShare);
  } catch (err) {
    return shareError('SaitoSign could not save the invitation secrets, so the emails were not sent.');
  }
  const origin = configuredPublicOrigin(mod.app);
  const link = shareLink(origin, id, share.token);
  if (!link) {
    return shareError('This server does not have a public address configured, so the invitation link could not be created.');
  }
  const mail = mod.app.modules.returnModule('MailRelay');
  if (!mail || typeof mail.sendMail !== 'function') {
    return {
      success: false,
      stored: true,
      link,
      error: 'SaitoSign could not find the mail relay, so the invitation emails were not sent.'
    };
  }
  if (typeof mail.ensureMailRelayService === 'function') {
    mail.ensureMailRelayService();
  }
  const signing = share.purpose === 'sign';
  const subject = signing
    ? `Please sign ${share.document_name}`
    : `${share.originator_name} shared ${share.document_name} with you`;
  const text = [
    signing
      ? `${share.originator_name} asked you to sign "${share.document_name}" in SaitoSign.`
      : `${share.originator_name} gave you access to "${share.document_name}" in SaitoSign.`,
    '',
    'Open the document here:',
    link,
    '',
    'SaitoSign keeps this server copy for about two days. It is not permanent storage.',
    share.originator_email ? `If you were not expecting this, you can ignore the message or contact ${share.originator_email}.` : 'If you were not expecting this, you can ignore the message.'
  ].join('\n');
  const requested = Array.isArray(data.recipients) ? recipientList(data.recipients) : null;
  const targets = requested
    ? share.recipients.filter((recipient) => requested.some((item) => item.email === normalizeEmail(recipient.email)))
    : share.recipients;
  const failed = [];
  let sent = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const recipient = targets[i];
    const personal = recipientLink(origin, id, share.token, recipient.verify_secret) || link;
    const personalText = text.replace(link, personal);
    try {
      await mail.sendMail({
        to: recipient.email,
        from: 'SaitoSign <no-reply@saito.tech>',
        subject,
        text: personalText,
        ishtml: false
      });
      sent += 1;
    } catch (err) {
      failed.push(`${recipient.email}: ${mailFailure(err)}`);
    }
  }
  if (failed.length) {
    return {
      success: false,
      stored: true,
      link,
      sent,
      error: `The mail relay rejected ${failed.length === 1 ? 'an invitation' : 'invitations'}. ${failed.join(' ')}`
    };
  }
  return { success: true, stored: true, link, sent };
}

async function redeemEmail(mod, data, tx) {
  const signer = uploaderKey(mod.app, tx);
  if (!signer.ok) {
    return shareError(signer.error);
  }
  const id = String(data.document_id || '').trim();
  const share = await mod.database.readShare(id).catch(() => null);
  if (!share || !sameToken(share.token, data.token)) {
    return shareError('This sharing link is not valid.');
  }
  let stored;
  try {
    stored = await mod.database.getDocument(id);
  } catch (err) {
    return shareError(err?.code === 'expired' ? 'This shared document has expired.' : 'The shared document could not be read.');
  }
  if (!stored || stored.expired) {
    return shareError('This shared document has expired.');
  }
  const recipient = recipientForSecret(share.recipients, data.verify_secret);
  if (!recipient || !recipient.email) {
    return shareError('This invitation could not be verified.');
  }
  let serverKey = String(mod.publicKey || '').trim();
  if (!serverKey && typeof mod.app?.wallet?.getPublicKey === 'function') {
    serverKey = String(await mod.app.wallet.getPublicKey()).trim();
  }
  if (!serverKey) {
    return shareError('SaitoSign could not confirm the identity server for this invitation.');
  }
  try {
    const proof = await signEmailVerification(mod.app, recipient.email, signer.publicKey);
    return {
      success: true,
      email: recipient.email,
      signer_index: Number.isInteger(recipient.signerIndex) ? recipient.signerIndex : null,
      signer_publickey: signer.publicKey,
      publickey: serverKey,
      message: proof.message,
      signature: proof.signature
    };
  } catch (err) {
    return shareError('SaitoSign could not sign the email verification.');
  }
}

async function handleShareRequest(mod, data, tx) {
  let password = '';
  if (data && Object.prototype.hasOwnProperty.call(data, 'password')) {
    password = String(data.password || '');
    delete data.password;
  }
  const action = String(data?.action || '');
  if (!mod.database || mod.app.BROWSER) {
    return shareError('Document sharing is only available from the SaitoSign server.');
  }
  if (action === 'create') return createShare(mod, data);
  if (action === 'fetch') return fetchShare(mod, data);
  if (action === 'update') return updateShare(mod, data, tx, password);
  if (action === 'invite') return inviteShare(mod, data);
  if (action === 'redeem-email') return redeemEmail(mod, data, tx);
  return shareError('SaitoSign did not recognize that sharing request.');
}

module.exports = {
  handleShareRequest,
  PUBLIC_KEY_MISMATCH,
  assignRecipientSecrets,
  recipientForSecret,
  hashRecipientSecret,
  redeemEmail
};
