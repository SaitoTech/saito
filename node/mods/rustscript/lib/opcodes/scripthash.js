/**
 * Purpose: SCRIPTHASH opcode — hash a resolved JSON script tree via canonical Script::hash.
 *
 * Language shape:
 *   script.source — JSON object (literal or resolve_ref path, e.g. context.rental_script)
 *   script.into   — short key under context.__opcodes.scripthash
 *
 * Does NOT reimplement hashing. When app.core.scripting.hash is available, uses that
 * (WASM → Script::hash). Otherwise fails closed so a second JS hash path cannot diverge.
 */

module.exports = {
  name: 'SCRIPTHASH',
  description: `
Resolves a JSON script tree and stores the canonical script hash under
context.__opcodes.scripthash.<into>.

The hash is computed by the Rust Script::hash implementation (via app.core.scripting.hash).
Witness stripping and canonicalization are not duplicated in JavaScript.
`,
  exampleScript: {
    op: 'SCRIPTHASH',
    source: 'context.rental_script',
    into: 'hash'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(node, 'source')) {
      return false;
    }

    const key = node.into;
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_]+$/.test(key)) {
      return false;
    }

    const resolved = resolveRef(context, node.source);
    if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
      return false;
    }

    const hashFn = context.app?.core?.scripting?.hash;
    if (typeof hashFn !== 'function') {
      return false;
    }

    let hash;
    try {
      hash = hashFn(resolved);
    } catch (err) {
      return false;
    }

    if (typeof hash !== 'string' || hash.length === 0) {
      return false;
    }

    if (!context.__opcodes) {
      context.__opcodes = {};
    }
    if (!context.__opcodes.scripthash) {
      context.__opcodes.scripthash = {};
    }
    context.__opcodes.scripthash[key] = hash;

    return true;
  }
};

function resolveRef(root, ref) {
  if (typeof ref !== 'string') {
    return ref;
  }
  const path = ref.startsWith('context.') ? ref.slice('context.'.length) : ref;
  const parts = path.split('.');
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
