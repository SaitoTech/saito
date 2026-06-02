/**
 * Purpose: IMPORTFIELD opcode — verify signed witness field and store in __opcodes.
 */

module.exports = {
  name: 'IMPORTFIELD',
  description: `
Imports a signed field into VARS.

Verifies that a value provided in witness was signed by an authorized publickey
over a binding hash (literal or VAR reference), then writes the value into VARS.

Typical use:
- import subscription duration
- import tier, scope, flags, etc.
`,
  exampleScript: {
    op: 'IMPORTFIELD',
    field: 'duration',
    publickey: '__opcodes.checkownnftwhere.creator',
    hash: '__opcodes.checkownnftwhere.nft_id',
    witness: {
      duration: '<integer>',
      signature: '<hex_signature>'
    }
  },
  schema: {
    field: 'string',
    publickey: 'reference',
    hash: 'reference',
    duration: 'integer',
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

    const field_name = node.field;
    if (typeof field_name !== 'string' || field_name.length === 0) {
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

    let value = witness[field_name];
    if (typeof value === 'string') {
      value = resolveRef(context, value);
    }
    let signature = witness.signature;
    if (typeof signature === 'string') {
      signature = resolveRef(context, signature);
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      return false;
    }
    if (typeof signature !== 'string' || signature.length === 0) {
      return false;
    }

    const canonical_string = String(value) + '|' + binding_hash;
    const digest = context.app.crypto.hash(canonical_string);

    if (context.app.crypto.verifyMessage(digest, signature, signer_pubkey) !== true) {
      return false;
    }

    if (!context.__opcodes) {
      context.__opcodes = {};
    }
    if (!context.__opcodes.importfield) {
      context.__opcodes.importfield = {};
    }
    context.__opcodes.importfield[field_name] = value;

    return true;
  }
};

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
