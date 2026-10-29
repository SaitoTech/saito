const QUOTE_TTL_MS = 25 * 60 * 1000;

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function quoteTimestamp(now = Date.now(), sequence = 0) {
  const time = Number(now);
  const suffix = Number(sequence) || 0;
  return `${time}-${suffix}`;
}

function quoteTime(timestamp) {
  const time = Number(String(timestamp || '').split('-')[0]);
  return Number.isFinite(time) ? time : NaN;
}

function quoteIsExpired(timestamp, now = Date.now()) {
  const time = quoteTime(timestamp);
  return !Number.isFinite(time) || now - time > QUOTE_TTL_MS;
}

function signQuote(crypto, data, privateKey) {
  return crypto.signMessage(canonicalJson(data), privateKey);
}

function verifyQuote(app, data, signature, publicKey) {
  if (!data || !signature || !publicKey || !app?.crypto?.verifyMessage) {
    return false;
  }
  try {
    return app.crypto.verifyMessage(canonicalJson(data), signature, publicKey) === true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  QUOTE_TTL_MS,
  canonicalJson,
  quoteTimestamp,
  quoteIsExpired,
  signQuote,
  verifyQuote
};
