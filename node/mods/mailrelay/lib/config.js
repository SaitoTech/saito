function isConfigObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function missingFields(config) {
  const missing = [];
  if (!String(config.host || '').trim()) {
    missing.push('host');
  }
  if (!isConfigObject(config.auth) || !String(config.auth.user || '').trim()) {
    missing.push('auth.user');
  }
  if (!isConfigObject(config.auth) || !String(config.auth.pass || '').trim()) {
    missing.push('auth.pass');
  }
  return missing;
}

function parseSendgridConfig(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw.trim());
    } catch (err) {
      throw new Error('SendGrid configuration is not valid JSON');
    }
  }
  if (!isConfigObject(parsed)) {
    throw new Error('SendGrid configuration must be a JSON object');
  }

  const missing = missingFields(parsed);
  if (missing.length) {
    throw new Error(`SendGrid configuration is incomplete (missing: ${missing.join(', ')})`);
  }

  return {
    host: String(parsed.host).trim(),
    port: parsed.port == null || parsed.port === '' ? 465 : Number(parsed.port),
    secure: parsed.secure !== false,
    auth: {
      user: String(parsed.auth.user).trim(),
      pass: String(parsed.auth.pass)
    }
  };
}

function resolveSendgridTransport(envValue, options = {}) {
  if (envValue && String(envValue).trim()) {
    return { source: 'environment', config: parseSendgridConfig(envValue) };
  }

  const stored = options?.sendgrid?.config;
  if (typeof stored === 'string' && stored.trim()) {
    return { source: 'wallet', config: parseSendgridConfig(stored) };
  }
  if (isConfigObject(stored)) {
    return { source: 'wallet', config: parseSendgridConfig(stored) };
  }
  return null;
}

function redactSendgridConfig(config) {
  const copy = parseSendgridConfig(config);
  copy.auth.pass = copy.auth.pass ? '••••••••' : '';
  return copy;
}

module.exports = {
  parseSendgridConfig,
  resolveSendgridTransport,
  redactSendgridConfig
};
