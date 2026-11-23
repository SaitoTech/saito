const {
  emailVerificationMessage,
  validVerification,
  verificationMethod,
  verifiedMethods
} = require('./auth');

function walletSignerKey(app) {
  let publickey = String(app?.wallet?.publicKey || '').trim();
  if (/^[0-9a-fA-F]+$/.test(publickey) && publickey.length >= 64 && typeof app?.crypto?.compressPublicKey === 'function') {
    publickey = String(app.crypto.compressPublicKey(publickey) || '').trim();
  }
  return publickey;
}

function namedPublicKey(entry, email) {
  const prefix = `Request received for verification of email ${email} with publickey `;
  const message = String(entry?.message || '');
  if (!email || !message.startsWith(prefix)) {
    return '';
  }
  const named = message.slice(prefix.length);
  if (!named || /\s/.test(named) || message !== emailVerificationMessage(email, named)) {
    return '';
  }
  return named;
}

function signerKeyForRecord(app, user, email) {
  const wanted = String(email || user?.email || '').trim();
  const entries = Array.isArray(user?.verifications) ? user.verifications : [];
  for (const entry of entries) {
    if (verificationMethod(entry) !== 'email') {
      continue;
    }
    const named = namedPublicKey(entry, wanted);
    if (!named) {
      continue;
    }
    const probe = { ...(user || {}), email: wanted, publickey: named };
    if (validVerification(app, entry, probe)) {
      return named;
    }
  }
  return walletSignerKey(app);
}

function proofPublicKey(user, fallback) {
  const current = String(user?.publickey || '').trim();
  return current || String(fallback || '').trim();
}

function rememberMethod(entry) {
  const method = verificationMethod(entry);
  if (!entry || (entry.method && String(entry.method).trim() === method)) {
    return entry;
  }
  if (!method) {
    return entry;
  }
  return { ...entry, method };
}

function keepMethod(app, user, entry) {
  const incoming = verificationMethod(entry);
  const kept = (Array.isArray(user?.verifications) ? user.verifications : []).filter((item) => {
    const itemMethod = verificationMethod(item);
    if (!itemMethod || (incoming && itemMethod === incoming)) {
      return false;
    }
    return validVerification(app, item, user);
  }).map((item) => rememberMethod(item));
  const stored = rememberMethod(entry);
  kept.push(stored);
  if (user) {
    user.verifications = kept;
  }
  return kept;
}

function copyVerification(entry) {
  const next = {
    method: verificationMethod(entry),
    publickey: String(entry?.publickey || ''),
    message: String(entry?.message || ''),
    signature: String(entry?.signature || '')
  };
  if (entry?.returned === true) {
    next.returned = true;
  }
  const photo = typeof entry?.photo === 'string' ? entry.photo : '';
  if (photo) {
    next.photo = photo;
  }
  const image = typeof entry?.image === 'string' ? entry.image : '';
  if (image) {
    next.image = image;
  }
  return next;
}

function storedPhoto(user) {
  const entries = Array.isArray(user?.verifications) ? user.verifications : [];
  const entry = entries.find((item) => verificationMethod(item) === 'photo' && typeof item.photo === 'string');
  const image = String(entry?.photo || '').trim();
  return image.startsWith('data:image/') ? image : '';
}

function storedPassport(user) {
  const entries = Array.isArray(user?.verifications) ? user.verifications : [];
  const entry = entries.find((item) => verificationMethod(item) === 'passport' && typeof item.image === 'string');
  const image = String(entry?.image || '').trim();
  return image.startsWith('data:image/') ? image : '';
}

function applyKnownVerifications(app, user, state) {
  const known = verifiedMethods(app, user);
  const image = storedPhoto(user);
  const passport = storedPassport(user);
  const verificationMethods = (state?.verificationMethods || []).map((method) => {
    if (!method.required) {
      return method;
    }
    if (!known.includes(method.id)) {
      return method.status === 'verified'
        ? { ...method, status: 'pending' }
        : method;
    }
    const next = method.status === 'verified' ? method : { ...method, status: 'verified', selected: true };
    if (method.id === 'photo' && image) {
      return { ...next, photo: image };
    }
    if (method.id === 'passport' && passport) {
      return { ...next, image: passport };
    }
    return next;
  });
  return { ...(state || {}), verificationMethods };
}

module.exports = {
  applyKnownVerifications,
  copyVerification,
  keepMethod,
  proofPublicKey,
  signerKeyForRecord
};
