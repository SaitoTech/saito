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

function actionPayload(action) {
  return {
    id: action.id,
    type: action.type,
    user: action.user,
    page: action.page,
    x: action.x,
    y: action.y,
    width: action.width,
    height: action.height
  };
}

function signAction(app, action, privateKey) {
  const payload = actionPayload(action);
  const signature = app.crypto.signMessage(canonicalJSON(payload), privateKey);
  return { id: payload.id, signature };
}

function actionSignature(user, action) {
  const id = Number(action?.id);
  const list = Array.isArray(user?.signatures) ? user.signatures : [];
  const found = list.find((entry) => Number(entry?.id) === id);
  return typeof found?.signature === 'string' ? found.signature : '';
}

function addSignature(app, action, privateKey) {
  return signAction(app, { ...action, type: 'signature' }, privateKey);
}

function addInitial(app, action, privateKey) {
  return signAction(app, { ...action, type: 'initial' }, privateKey);
}

function verifyActionSignature(app, action, user) {
  const publicKey = String(user?.publickey || '');
  const signature = actionSignature(user, action);
  if (!action || !signature || !publicKey) {
    return false;
  }
  if (action.type !== 'signature' && action.type !== 'initial') {
    return false;
  }
  return app.crypto.verifyMessage(canonicalJSON(actionPayload(action)), signature, publicKey);
}

function requiredActions(actions) {
  return (actions || []).filter((action) => action.type === 'signature' || action.type === 'initial');
}

function userActionsSigned(app, actions, users, userIndex) {
  const user = users?.[userIndex];
  return requiredActions(actions)
    .filter((action) => action.user === userIndex)
    .every((action) => verifyActionSignature(app, action, user));
}

function allActionsSigned(app, actions, users) {
  return requiredActions(actions).every((action) =>
    verifyActionSignature(app, action, users?.[action.user])
  );
}

function actionStatus(app, actions, users, userIndex) {
  const required = requiredActions(actions);
  const signed = required.filter((action) =>
    verifyActionSignature(app, action, users?.[action.user])
  ).length;
  const mine = required.filter((action) => action.user === userIndex);
  const mineSigned = mine.filter((action) =>
    verifyActionSignature(app, action, users?.[userIndex])
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

function rememberEmail(app, publickey, email) {
  const address = String(email || '').trim();
  const key = String(publickey || '').trim();
  if (!app.keychain || !key || !isEmailAddress(address)) {
    return;
  }
  const existing = app.keychain.returnKey(key, true);
  const data = { email: address };
  const identifier = String(existing?.identifier || '').trim();
  if (!identifier || isEmailAddress(identifier)) {
    data.identifier = address;
  }
  app.keychain.addKey(key, data);
}

function verifiedMethods(app, user) {
  const email = String(user?.email || '').trim();
  const publickey = String(user?.publickey || '').trim();
  const entries = Array.isArray(user?.verifications) ? user.verifications : [];
  const found = [];
  entries.forEach((entry) => {
    if (!entry?.signature || !entry?.message || !entry?.publickey) {
      return;
    }
    if (!app.crypto.verifyMessage(entry.message, entry.signature, entry.publickey)) {
      return;
    }
    const method = String(entry.method || '').trim();
    if (method) {
      found.push(method);
      return;
    }
    if (email && publickey && entry.message.includes(email) && entry.message.includes(publickey)) {
      found.push('email');
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
    if (!entry.message.includes(email) || !entry.message.includes(publickey)) {
      return false;
    }
    return app.crypto.verifyMessage(entry.message, entry.signature, entry.publickey);
  });
  return holds ? email : '';
}

function signedMaterial(record) {
  return {
    document: {
      name: record.document?.name || '',
      pdf: record.document?.pdf || '',
      page_count: Number(record.document?.page_count) || 0,
      page_width: Number(record.document?.page_width) || 0,
      page_height: Number(record.document?.page_height) || 0
    },
    actions: (record.actions || []).map((action) => ({
      id: action.id,
      type: action.type,
      user: action.user,
      page: action.page,
      x: action.x,
      y: action.y,
      width: action.width,
      height: action.height
    }))
  };
}

function documentHash(app, record) {
  return app.crypto.hash(canonicalJSON(signedMaterial(record)));
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
  verifyEmailSignature,
  addSignature,
  addInitial,
  verifyActionSignature,
  documentHash,
  documentUnchanged,
  userActionsSigned,
  allActionsSigned,
  actionStatus,
  myKeychainEmail,
  rememberEmail,
  rememberVerifiedEmails,
  verifiedMethods
};
