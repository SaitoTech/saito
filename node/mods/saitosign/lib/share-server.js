const { randomBytes } = require('crypto');
const { configuredPublicOrigin } = require('./recovery');
const { SHARE_RETENTION_MS, recipientList, invalidRecipients, normalizeEmail, shareLink } = require('./share-protocol');
const { allActionsSigned } = require('./auth');
const {
  commitCanonicalMerge,
  uploaderKey,
  PUBLIC_KEY_MISMATCH
} = require('./signature-merge');

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
  let stored;
  try {
    stored = await mod.database.saveDocument(payload, {
      isEncrypted: encrypted,
      retentionMs: SHARE_RETENTION_MS,
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

async function updateShare(mod, data, tx) {
  const id = String(data.document_id || '').trim();
  const share = await mod.database.readShare(id).catch(() => null);
  if (!share || !sameToken(share.token, data.token)) {
    return shareError('This sharing link is not valid. Ask the sender for a new link.');
  }
  if (data.is_encrypted === true) {
    return replaceShare(mod, id, data);
  }
  return enqueueMerge(id, () => mergeShare(mod, id, share, data, tx));
}

async function replaceShare(mod, id, data) {
  try {
    const stored = await mod.database.updateSharedPayload(id, data.document, {
      expectedHash: data.expected_hash,
      isEncrypted: true
    });
    return {
      success: true,
      document_id: id,
      document_hash: stored.document_hash,
      is_encrypted: stored.is_encrypted
    };
  } catch (err) {
    return shareUpdateError(err);
  }
}

async function mergeShare(mod, id, share, data, tx) {
  const signer = uploaderKey(mod.app, tx);
  if (!signer.ok) {
    return shareError(signer.error);
  }
  let serverKey = String(mod.publicKey || '').trim();
  if (!serverKey && typeof mod.app?.wallet?.getPublicKey === 'function') {
    serverKey = String(await mod.app.wallet.getPublicKey()).trim();
  }
  if (!serverKey) {
    return shareError('SaitoSign could not confirm the identity server for this signature.');
  }
  let submitted;
  try {
    const { documentFromStored } = require('./share-client');
    submitted = await documentFromStored(mod.app, data.document, '');
  } catch (err) {
    return shareError(err?.message || 'The signed document could not be read.');
  }
  let merged;
  try {
    const { buildDocumentArchive, zipPackage } = require('./archive');
    merged = await commitCanonicalMerge({
      app: mod.app,
      signerKey: signer.publicKey,
      serverKey,
      submitted,
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
        if (stored.is_encrypted) {
          const invalid = new Error('This shared document is password protected and cannot be merged by the server.');
          invalid.code = 'invalid';
          throw invalid;
        }
        const { documentFromStored } = require('./share-client');
        return {
          record: await documentFromStored(mod.app, stored.document, ''),
          storageHash: stored.document_hash
        };
      },
      buildArchive: async (record) => {
        const archive = await buildDocumentArchive(mod.app, record);
        return zipPackage(archive.bytes);
      },
      writeCanonical: (packed, expectedHash) => mod.database.saveMergedPayload(id, packed, {
        expectedHash,
        retentionMs: SHARE_RETENTION_MS
      })
    });
  } catch (err) {
    return shareUpdateError(err);
  }
  if (!merged.ok) {
    return shareError(merged.error);
  }
  const complete = merged.complete === true && allActionsSigned(mod.app, merged.record.actions, merged.record.users, merged.record) === true;
  if (merged.stored) {
    await notifySignatureMerge(mod, share, {
      complete,
      signerName: merged.signerName
    });
  }
  return {
    success: true,
    document_id: id,
    document_hash: merged.storageHash,
    is_encrypted: false,
    merged: merged.stored === true,
    already_present: merged.stored !== true,
    added: merged.added,
    complete,
    stages: ['uploaded', 'verified', 'validated', 'merged', 'saved']
  };
}

function shareUpdateError(err) {
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

async function notifySignatureMerge(mod, share, details) {
  try {
    const mail = mod.app.modules.returnModule('MailRelay');
    if (!mail || typeof mail.sendMail !== 'function') {
      return;
    }
    const link = shareLink(configuredPublicOrigin(mod.app), share.document_id, share.token);
    const name = String(details.signerName || '').trim() || 'A recipient';
    const complete = details.complete === true;
    const subject = complete
      ? `${share.document_name} is fully signed`
      : `A signature was added to ${share.document_name}`;
    const text = [
      complete
        ? `Every required signature is now present on "${share.document_name}".`
        : `${name} added a signature to "${share.document_name}".`,
      '',
      'Open the latest version:',
      link
    ].join('\n');
    for (let i = 0; i < share.recipients.length; i += 1) {
      try {
        await mail.sendMail({
          to: share.recipients[i].email,
          from: 'SaitoSign <no-reply@saito.tech>',
          subject,
          text,
          ishtml: false
        });
      } catch (err) {
        console.error(mailFailure(err));
      }
    }
  } catch (err) {
    console.error(mailFailure(err));
  }
}

async function inviteShare(mod, data) {
  const id = String(data.document_id || '').trim();
  const share = await mod.database.readShare(id).catch(() => null);
  if (!share || !sameToken(share.token, data.token)) {
    return shareError('This sharing link is not valid.');
  }
  const link = shareLink(configuredPublicOrigin(mod.app), id, share.token);
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
    try {
      await mail.sendMail({
        to: recipient.email,
        from: 'SaitoSign <no-reply@saito.tech>',
        subject,
        text,
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

async function handleShareRequest(mod, data, tx) {
  if (data && Object.prototype.hasOwnProperty.call(data, 'password')) {
    delete data.password;
  }
  const action = String(data?.action || '');
  if (!mod.database || mod.app.BROWSER) {
    return shareError('Document sharing is only available from the SaitoSign server.');
  }
  if (action === 'create') return createShare(mod, data);
  if (action === 'fetch') return fetchShare(mod, data);
  if (action === 'update') return updateShare(mod, data, tx);
  if (action === 'invite') return inviteShare(mod, data);
  return shareError('SaitoSign did not recognize that sharing request.');
}

module.exports = { handleShareRequest, PUBLIC_KEY_MISMATCH };
