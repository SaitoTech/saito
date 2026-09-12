/**
 * First-pass NFT execution-risk classification.
 * Not a complete security scanner. Unknown / unscannable content is never Low.
 *
 * Low        — no code-execution path in the base Saito/browser context
 * Medium     — potentially executable; requires manual review (CSS/JS default)
 * High       — significant risk; unusually careful review; obfuscated but not in an executable field
 * Dangerous  — concrete security problem, or obfuscated code in an executable context (JS/CSS/SVG)
 */

const LEVELS = Object.freeze(['Low', 'Medium', 'High', 'Dangerous']);
const RANK = Object.freeze({ Low: 0, Medium: 1, High: 2, Dangerous: 3 });

const RASTER_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

const WALLET_ACCESS_RE = /app\.options|\bwallet\b/i;

// CSS constructs that are known to execute script or load executable payloads
// in browser CSS engines (including historical engines Saito cannot assume away).
const CSS_SCRIPT_EXEC_RES = [
  /expression\s*\(/i,
  /javascript\s*:/i,
  /behavior\s*:/i,
  /-ms-behavior\s*:/i,
  /-moz-binding\s*:/i,
  /progid\s*:\s*DXImageTransform/i,
  /url\s*\(\s*['"]?\s*javascript\s*:/i,
  /url\s*\(\s*['"]?\s*vbscript\s*:/i,
  /url\s*\(\s*['"]?\s*data\s*:\s*(text\/(javascript|ecmascript|html)|application\/(javascript|ecmascript|x-javascript))/i,
  /@import\s+(?:url\s*\()?\s*['"]?\s*data\s*:/i
];

const CSS_HARD_REVIEW_RES = [
  /url\s*\(\s*['"]?\s*data\s*:\s*image\/svg/i,
  /@import\s+/i,
  /-webkit-image-set\s*\(/i,
  /-o-link\s*:/i,
  /[\s;{]binding\s*:/i
];

const KNOWN_PAYLOAD_KEYS = new Set([
  'image',
  'css',
  'js',
  'text',
  'expires_at',
  'title',
  'description',
  'path'
]);

// Opaque containers we will not unpack. Presence alone is High.
const OPAQUE_BINARY_KEYS = new Set([
  'file',
  'zip',
  'rom',
  'mod',
  'wasm',
  'binary',
  'archive',
  'bundle',
  'pkg',
  'nwasm'
]);

const OPAQUE_BINARY_DATA_URI_RE =
  /data:\s*(application\/(zip|x-zip-compressed|x-7z-compressed|gzip|x-gzip|x-tar|wasm|octet-stream|vnd\.rar|x-n64-rom|x-gba-rom)|application\/x-wasm)/i;

const JS_DYNAMIC_EXEC_RES = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bFunction\s*\(/,
  /\bsetTimeout\s*\(\s*['"`]/,
  /\bsetInterval\s*\(\s*['"`]/,
  /\bimport\s*\(/,
  /\bdocument\.write\s*\(/,
  /\.innerHTML\s*=/,
  /\.outerHTML\s*=/,
  /\bexecScript\s*\(/
];

const OBFUSCATION_RES = [
  /\bunescape\s*\(/i,
  /\batob\s*\(/,
  /\bbtoa\s*\(/,
  /\bfromCharCode\s*\(/,
  /\bfromCodePoint\s*\(/,
  /\bdecodeURIComponent\s*\(/i,
  /\bdecodeURI\s*\(/,
  /\beval\s*\(\s*function\s*\(/i,
  /\\x[0-9a-fA-F]{2}/,
  /\\u[0-9a-fA-F]{4}/,
  /\\u\{[0-9a-fA-F]+\}/,
  /\\[0-7]{3}/,
  /&#x?[0-9a-fA-F]+;/i,
  /(?:%[0-9a-fA-F]{2}){4,}/
];

function worse(a, b) {
  const left = LEVELS.includes(a) ? a : 'Medium';
  const right = LEVELS.includes(b) ? b : 'Medium';
  return RANK[left] >= RANK[right] ? left : right;
}

function asText(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

function decodeCssEscapes(css = '') {
  return String(css)
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/\\(.)/g, '$1');
}

function decodeJsEscapes(js = '') {
  return String(js)
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function scanLevels(source, regexes) {
  return regexes.some((re) => re.test(source));
}

function hexEscapeDecodesToCode(source = '') {
  const hex = /\\([0-9a-fA-F]{1,6})\s?/g;
  let match;
  while ((match = hex.exec(source))) {
    const code = parseInt(match[1], 16);
    if (!Number.isFinite(code)) {
      continue;
    }
    // Escaped ASCII letters/digits/punctuation hide keywords from plaintext review.
    if (code >= 33 && code <= 126) {
      return true;
    }
  }
  return false;
}

function sourceLooksObfuscated(source = '') {
  const s = asText(source);
  if (!s) {
    return false;
  }
  if (scanLevels(s, OBFUSCATION_RES)) {
    return true;
  }
  if (hexEscapeDecodesToCode(s)) {
    return true;
  }
  return false;
}

function obfuscationRank(executable) {
  return executable ? 'Dangerous' : 'High';
}

function returnTxMessage(tx) {
  if (!tx) {
    return {};
  }
  if (typeof tx.returnMessage === 'function') {
    try {
      return tx.returnMessage() || {};
    } catch (err) {
      return tx.msg || {};
    }
  }
  return tx.msg && typeof tx.msg === 'object' ? tx.msg : {};
}

function payloadFromTx(tx) {
  const txmsg = returnTxMessage(tx);
  const data =
    txmsg.data && typeof txmsg.data === 'object' && !Array.isArray(txmsg.data) ? txmsg.data : {};
  return { txmsg, data };
}

function imageMime(dataUri = '') {
  const match = String(dataUri).match(/^data:([^;,]+)/i);
  if (!match) {
    return '';
  }
  let mime = match[1].toLowerCase();
  if (mime === 'image/jpg') {
    mime = 'image/jpeg';
  }
  return mime;
}

function checkImageSecurity(image = '') {
  const src = String(image || '');
  if (!src) {
    return 'Low';
  }

  if (/^\s*data:/i.test(src)) {
    const mime = imageMime(src);
    if (!mime.startsWith('image/')) {
      return 'Dangerous';
    }
    if (mime === 'image/svg+xml' || mime.startsWith('image/svg')) {
      // Base64 SVG hides markup from review and can contain script.
      if (/;base64,/i.test(src) || sourceLooksObfuscated(src)) {
        return 'Dangerous';
      }
      if (
        /<script/i.test(src) ||
        /javascript\s*:/i.test(src) ||
        /\bon\w+\s*=/i.test(src) ||
        WALLET_ACCESS_RE.test(src)
      ) {
        return 'Dangerous';
      }
      return 'Medium';
    }
    if (RASTER_IMAGE_MIMES.has(mime)) {
      return 'Low';
    }
    return 'Medium';
  }

  if (/^https?:\/\//i.test(src) || src.startsWith('/')) {
    return 'Medium';
  }

  return 'Medium';
}

function checkCSSSecurity(source = '') {
  const css = asText(source);
  if (!css.trim()) {
    return 'Medium';
  }

  const decoded = decodeCssEscapes(css);
  const haystacks = decoded === css ? [css] : [css, decoded];

  for (const text of haystacks) {
    if (scanLevels(text, CSS_SCRIPT_EXEC_RES)) {
      return 'Dangerous';
    }
  }

  if (sourceLooksObfuscated(css) || (decoded !== css && hexEscapeDecodesToCode(css))) {
    return 'Dangerous';
  }

  for (const text of haystacks) {
    if (WALLET_ACCESS_RE.test(text)) {
      return 'High';
    }
    if (scanLevels(text, CSS_HARD_REVIEW_RES)) {
      return 'High';
    }
  }

  return 'Medium';
}

function checkJSSecurity(source = '') {
  const js = asText(source);
  if (!js.trim()) {
    return 'Medium';
  }

  const decoded = decodeJsEscapes(js);
  const haystacks = decoded === js ? [js] : [js, decoded];

  for (const text of haystacks) {
    if (WALLET_ACCESS_RE.test(text)) {
      return 'Dangerous';
    }
  }

  if (sourceLooksObfuscated(js) || sourceLooksObfuscated(decoded)) {
    return 'Dangerous';
  }

  for (const text of haystacks) {
    if (scanLevels(text, JS_DYNAMIC_EXEC_RES)) {
      return 'High';
    }
  }

  return 'Medium';
}

function looksLikeOpaqueBinary(value) {
  const s = asText(value);
  if (!s) {
    return false;
  }
  if (OPAQUE_BINARY_DATA_URI_RE.test(s)) {
    return true;
  }
  if (s.startsWith('PK\x03\x04') || s.startsWith('\0asm')) {
    return true;
  }
  // ZIP / WASM magic as base64 ("PK.." / "\0asm")
  if (s.startsWith('UEsDB') || s.startsWith('AGFzbQ')) {
    return true;
  }
  return false;
}

function containsOpaqueBinary(value, depth = 0) {
  if (depth > 6 || value == null) {
    return false;
  }
  if (typeof value === 'string') {
    return looksLikeOpaqueBinary(value);
  }
  if (typeof value !== 'object') {
    return false;
  }
  const entries = Array.isArray(value)
    ? value.map((item, i) => [String(i), item])
    : Object.entries(value);
  for (const [key, nested] of entries) {
    if (OPAQUE_BINARY_KEYS.has(String(key).toLowerCase()) && nested) {
      return true;
    }
    if (containsOpaqueBinary(nested, depth + 1)) {
      return true;
    }
  }
  return false;
}

function checkTextSecurity(text = '') {
  const value = asText(text);
  if (!value.trim()) {
    return 'Low';
  }
  const executable_markup =
    /<script/i.test(value) || /javascript\s*:/i.test(value) || /^\s*</.test(value);
  if (executable_markup) {
    if (/<script/i.test(value) || /javascript\s*:/i.test(value) || WALLET_ACCESS_RE.test(value)) {
      return 'Dangerous';
    }
    if (sourceLooksObfuscated(value)) {
      return 'Dangerous';
    }
    return 'Medium';
  }
  if (sourceLooksObfuscated(value)) {
    return 'High';
  }
  if (WALLET_ACCESS_RE.test(value)) {
    return 'High';
  }
  return 'Low';
}

/**
 * @param {*} tx listing or mint transaction (must expose returnMessage() or .msg)
 * @returns {"Low"|"Medium"|"High"|"Dangerous"}
 */
function checkSecurityLevel(tx) {
  if (!tx) {
    return 'Medium';
  }

  let data = {};
  try {
    data = payloadFromTx(tx).data;
  } catch (err) {
    return 'Medium';
  }

  const levels = [];

  if (typeof data.js !== 'undefined' && data.js !== null) {
    levels.push(String(data.js).length ? checkJSSecurity(data.js) : 'Medium');
  }
  if (typeof data.css !== 'undefined' && data.css !== null) {
    levels.push(String(data.css).length ? checkCSSSecurity(data.css) : 'Medium');
  }
  if (typeof data.image !== 'undefined' && data.image) {
    levels.push(checkImageSecurity(data.image));
  }
  if (typeof data.text !== 'undefined' && data.text) {
    levels.push(checkTextSecurity(data.text));
  }
  const executable_payload =
    (typeof data.js !== 'undefined' && data.js !== null) ||
    (typeof data.css !== 'undefined' && data.css !== null);
  if (containsOpaqueBinary(data)) {
    levels.push(obfuscationRank(executable_payload));
  }

  const blob = asText(data);
  if (typeof data.js === 'undefined' && /\bfunction\b|\beval\s*\(/.test(blob)) {
    levels.push(checkJSSecurity(blob));
  }
  if (
    typeof data.css === 'undefined' &&
    /\{[^}]*:[^}]*\}/.test(blob) &&
    /url\s*\(|expression\s*\(/i.test(blob)
  ) {
    levels.push(checkCSSSecurity(blob));
  }

  const unknown_keys = Object.keys(data).filter((key) => !KNOWN_PAYLOAD_KEYS.has(key));
  if (unknown_keys.length) {
    if (sourceLooksObfuscated(blob)) {
      levels.push('High');
    } else if (WALLET_ACCESS_RE.test(blob)) {
      levels.push('High');
    } else {
      levels.push('Medium');
    }
  }

  if (!levels.length) {
    // No analyzable payload — not Low, because we could not prove it is display-only.
    return 'Medium';
  }

  return levels.reduce(worse, 'Low');
}

module.exports = {
  checkSecurityLevel,
  checkCSSSecurity,
  checkJSSecurity
};
