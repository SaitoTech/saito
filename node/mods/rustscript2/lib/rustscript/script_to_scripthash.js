/**
 * script → scripthash
 *
 * Input:  script object (canonical RustScript AST)
 * Output: 64-character lowercase hex Blake3 digest of the script
 *
 * Pure function: no validation, execution, mutation, or side effects.
 *
 * ---------------------------------------------------------------------------
 * HASHING RULES
 * ---------------------------------------------------------------------------
 *
 * Hash the script exactly as it exists — every field and value that is present
 * participates in the digest. Do not strip, transform, or normalize away any
 * part of the script before hashing.
 *
 * The `required` object is part of the script. Its values are hashed literally:
 *
 *   { "required": { "signature": true } }
 *
 * and
 *
 *   { "required": { "signature": "552a50c7..." } }
 *
 * MUST produce different hashes. A creator may intentionally commit to specific
 * supplied values (or to placeholders marked true) when authoring the script.
 *
 * Do not:
 *   - remove `required` because values are missing or present
 *   - coerce true → absent or absent → true
 *   - merge supplied values with scaffold placeholders
 *   - run validation or execution before hashing
 *
 * ---------------------------------------------------------------------------
 * SERIALIZATION (for cross-runtime determinism)
 * ---------------------------------------------------------------------------
 *
 * 1. Deep-copy via recursive stable JSON (object keys sorted lexicographically
 *    at each object; array element order preserved; values unchanged).
 * 2. UTF-8 encode the JSON string.
 * 3. Blake3 hash → hex (same algorithm as Saito `app.crypto.hash`).
 *
 * Key order in the in-memory object does not affect the hash; value content does.
 * A future Rust port should mirror this serialization and Blake3 step exactly.
 */

const blake3 = require('blake3');

function stableJsonStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableJsonStringify(item)).join(',') + ']';
  }

  const keys = Object.keys(value).sort();
  const parts = keys.map((key) => JSON.stringify(key) + ':' + stableJsonStringify(value[key]));
  return '{' + parts.join(',') + '}';
}

function script_to_scripthash(script) {
  const json = stableJsonStringify(script);
  return blake3.hash(json).toString('hex');
}

module.exports = script_to_scripthash;
