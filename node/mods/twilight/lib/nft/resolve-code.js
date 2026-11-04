/**
 * Resolve executable NFT card code for Twilight Struggle.
 *
 * Supported shapes:
 * - legacy string
 * - array of strings (NFT_EVENT index selection)
 * - array of { name, code } (multi-event programmable cards)
 *
 * Empty entries are ignored for default/card-play resolution so unfinished
 * editor tabs never become executable payloads.
 */
function resolveExecutableCode(code, selector = null) {
  if (typeof code === 'string') {
    return code.trim() ? code : null;
  }
  if (!Array.isArray(code) || !code.length) {
    return null;
  }

  if (selector != null && String(selector) !== '') {
    const key = String(selector);
    const as_index = Number(key);
    if (Number.isInteger(as_index) && String(as_index) === key) {
      const entry = code[as_index];
      const value = typeof entry === 'string' ? entry : entry?.code;
      return typeof value === 'string' && value.trim() ? value : null;
    }
    const named = code.find(
      (entry) => entry && typeof entry === 'object' && String(entry.name) === key
    );
    if (named && typeof named.code === 'string' && named.code.trim()) {
      return named.code;
    }
    return null;
  }

  for (const entry of code) {
    const value = typeof entry === 'string' ? entry : entry?.code;
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

/**
 * Preserve NFT code for deck mirrors without collapsing multi-event arrays.
 */
function normalizeStoredCode(code) {
  if (typeof code === 'string') {
    return code.replace(/\t/g, ' ');
  }
  if (!Array.isArray(code)) {
    return '';
  }

  const entries = code
    .map((entry) => {
      if (typeof entry === 'string') {
        const body = entry.replace(/\t/g, ' ');
        return body.trim() ? body : null;
      }
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const name = String(entry.name || '').trim();
      const body = String(entry.code || '').replace(/\t/g, ' ');
      if (!name || !body.trim()) {
        return null;
      }
      return { name, code: body };
    })
    .filter(Boolean);

  if (!entries.length) {
    return '';
  }
  if (entries.length === 1 && typeof entries[0] === 'string') {
    return entries[0];
  }
  if (entries.length === 1 && entries[0].code) {
    // Named single-entry arrays still collapse to a string for legacy callers.
    return entries[0].code;
  }
  return entries;
}

module.exports = {
  resolveExecutableCode,
  normalizeStoredCode
};
