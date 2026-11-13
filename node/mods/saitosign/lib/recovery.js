const WRITER_KEY = 'saitosign-writer';
const CODE_KEY = 'saitosign-code';
const HANDOFF_KEY = 'saitosign-handoff';
const CHANNEL = 'saitosign';

function configuredPublicOrigin(app) {
  const endpoint = app?.options?.server?.endpoint;
  if (!endpoint || typeof endpoint !== 'object') {
    return '';
  }
  const protocol = String(endpoint.protocol || '').trim().toLowerCase().replace(/:$/, '');
  const host = String(endpoint.host || '').trim();
  const port = Number(endpoint.port);
  if (protocol !== 'http' && protocol !== 'https') {
    return '';
  }
  if (!host || /[\s/\\]/.test(host)) {
    return '';
  }
  const standardPort = (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80);
  const suffix = Number.isInteger(port) && port > 0 && !standardPort ? `:${port}` : '';
  return `${protocol}://${host}${suffix}`;
}

function canWriteDraft(current, incoming) {
  const owner = String(current?.handoff?.writerId || '');
  if (!owner) {
    return true;
  }
  return owner === String(incoming?.handoff?.writerId || '');
}

function recoveryPlan(input) {
  const urlCode = String(input?.urlCode || '');
  const writerId = String(input?.writerId || '');
  const saved = input?.saved;
  const savedCode = String(saved?.code || '');
  const owner = String(saved?.handoff?.writerId || '');

  if (urlCode) {
    if (!saved || savedCode !== urlCode || input.eligible !== true) {
      return { action: 'missing', code: urlCode };
    }
    if (owner && owner === writerId) {
      return { action: 'restore', code: urlCode };
    }
    if (owner) {
      return { action: 'missing', code: urlCode };
    }
    return { action: 'claim', code: urlCode };
  }

  if (writerId && saved && owner === writerId) {
    return { action: 'restore', code: savedCode };
  }
  return { action: 'none', code: '' };
}

function sessionWriter() {
  try {
    return sessionStorage.getItem(WRITER_KEY) || '';
  } catch (err) {
    return '';
  }
}

function rememberWriter(writerId, code) {
  try {
    sessionStorage.setItem(WRITER_KEY, writerId);
    sessionStorage.setItem(CODE_KEY, code);
  } catch (err) {}
}

function newWriterId() {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function markCodeReturned(document, code) {
  const users = Array.isArray(document?.users) ? document.users : [];
  users.forEach((user) => {
    const entries = Array.isArray(user?.verifications) ? user.verifications : [];
    entries.forEach((entry) => {
      if (entry && entry.signature === code) {
        entry.returned = true;
      }
    });
  });
}

function walletOwnsKey(app, publickey) {
  const wanted = String(publickey || '').trim();
  const raw = String(app?.wallet?.publicKey || '').trim();
  if (!wanted || !raw) {
    return false;
  }
  if (wanted === raw) {
    return true;
  }
  try {
    const compressed = app.crypto?.compressPublicKey ? app.crypto.compressPublicKey(raw) : '';
    return Boolean(compressed) && wanted === compressed;
  } catch (err) {
    return false;
  }
}

function challengedKey(message) {
  const match = String(message || '').match(/^Request received for verification of email \S+ with publickey (\S+)$/);
  return match ? match[1] : '';
}

function clearVerificationQuery() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('code')) {
      return;
    }
    url.searchParams.delete('code');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, '', next);
  } catch (err) {}
}

function announceHandoff(code, writerId) {
  const payload = { type: 'email-verified', code, writerId, at: Date.now() };
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch (err) {}
  try {
    localStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
  } catch (err) {}
}

function listenForHandoff(onHandoff) {
  const deliver = (payload) => {
    if (!payload || payload.type !== 'email-verified' || !payload.code) {
      return;
    }
    if (payload.writerId && payload.writerId === sessionWriter()) {
      return;
    }
    onHandoff(payload);
  };
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => deliver(event.data);
  } catch (err) {}
  window.addEventListener('storage', (event) => {
    if (event.key !== HANDOFF_KEY || !event.newValue) {
      return;
    }
    try {
      deliver(JSON.parse(event.newValue));
    } catch (err) {}
  });
}

module.exports = {
  configuredPublicOrigin,
  canWriteDraft,
  recoveryPlan,
  sessionWriter,
  rememberWriter,
  newWriterId,
  markCodeReturned,
  walletOwnsKey,
  challengedKey,
  clearVerificationQuery,
  announceHandoff,
  listenForHandoff
};
