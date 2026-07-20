/**
 * Purpose: IMPORTARRAY opcode — verify a signed witness array and store it
 * under `key` in context.__opcodes.importarray.
 *
 * Language shape (KEY / VALUE):
 *   script.key           — variable name to create
 *   witness.value        — imported array
 *   witness.signature    — authorizes that array
 *   script.hash          — contextual binding (same as IMPORTFIELD)
 *
 * digest = HASH(canonical_json(value) | binding_hash)
 */

module.exports = {
  name: 'IMPORTARRAY',
  description: `
Imports a signed array into VARS under a named key.

Verifies that witness.value (an array) was signed by an authorized publickey
over a binding hash (literal or VAR reference), then writes the array into
context.__opcodes.importarray[key].

Typical use:
- import successor payment schedules
- import allow-lists, hop sets, etc.
`,
  exampleScript: {
    op: 'IMPORTARRAY',
    key: 'successors',
    publickey: '__opcodes.checkownnftwhere.creator',
    hash: '__opcodes.checkownnftwhere.nft_id',
    witness: {
      value: [
        { public_key: '<publickey>', amount: 100 },
        { public_key: '<publickey>', amount: 50 }
      ],
      signature: '<hex_signature>'
    }
  },
  schema: {
    key: 'string',
    publickey: 'reference',
    hash: 'reference',
    value: 'array',
    signature: 'signature'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }
    if (
      !context.app ||
      !context.app.crypto ||
      typeof context.app.crypto.hash !== 'function' ||
      typeof context.app.crypto.verifyMessage !== 'function'
    ) {
      return false;
    }

    const key = node.key;
    if (typeof key !== 'string' || key.length === 0) {
      return false;
    }

    const witness = node.witness;
    if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
      return false;
    }

    let signer_pubkey = node.publickey;
    if (typeof signer_pubkey === 'string') {
      signer_pubkey = resolveRef(context, signer_pubkey);
    }
    let binding_hash = node.hash;
    if (typeof binding_hash === 'string') {
      binding_hash = resolveRef(context, binding_hash);
    }
    if (typeof signer_pubkey !== 'string' || signer_pubkey.length === 0) {
      return false;
    }
    if (typeof binding_hash !== 'string' || binding_hash.length === 0) {
      return false;
    }

    let value = witness.value;
    if (typeof value === 'string') {
      value = resolveRef(context, value);
    }
    let signature = witness.signature;
    if (typeof signature === 'string') {
      signature = resolveRef(context, signature);
    }
    if (!Array.isArray(value)) {
      return false;
    }
    if (typeof signature !== 'string' || signature.length === 0) {
      return false;
    }

    const canonical_string = canonicalJson(value) + '|' + binding_hash;
    const digest = context.app.crypto.hash(canonical_string);

    if (context.app.crypto.verifyMessage(digest, signature, signer_pubkey) !== true) {
      return false;
    }

    if (!context.__opcodes) {
      context.__opcodes = {};
    }
    if (!context.__opcodes.importarray) {
      context.__opcodes.importarray = {};
    }
    context.__opcodes.importarray[key] = value;

    return true;
  }
};

/** Match Rust `canonical_json`: sorted object keys, stable array order. */
function canonicalJson(value) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return (
      '{' +
      keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') +
      '}'
    );
  }
  return 'null';
}

function resolveRef(root, ref) {
  if (typeof ref !== 'string') {
    return ref;
  }
  const parts = ref.split('.');
  let cursor = root;
  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    if (
      !cursor ||
      typeof cursor !== 'object' ||
      !Object.prototype.hasOwnProperty.call(cursor, key)
    ) {
      return ref;
    }
    cursor = cursor[key];
  }
  return cursor;
}
