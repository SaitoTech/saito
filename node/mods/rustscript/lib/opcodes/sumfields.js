/**
 * Purpose: SUMFIELDS opcode — add two resolved values into __opcodes.sumfields.
 */

module.exports = {
  name: 'SUMFIELDS',
  description: `
Adds two numeric fields (resolved via VARS or literals) and stores the result
inside context.__opcodes.sumfields under a controlled key.
`,
  exampleScript: {
    op: 'SUMFIELDS',
    a: '__opcodes.checkpathhop.activation_time',
    b: '__opcodes.importfield.duration',
    into: 'expiry'
  },
  schema: {
    a: 'reference',
    b: 'reference',
    into: 'string'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const left = resolveRef(context, node.a);
    const right = resolveRef(context, node.b);

    if (left === undefined || right === undefined) {
      return false;
    }

    const l = Number(left);
    const r = Number(right);
    if (!Number.isFinite(l) || !Number.isFinite(r)) {
      return false;
    }

    const key = node.into;
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_]+$/.test(key)) {
      return false;
    }

    if (!context.__opcodes) {
      context.__opcodes = {};
    }
    if (!context.__opcodes.sumfields) {
      context.__opcodes.sumfields = {};
    }
    context.__opcodes.sumfields[key] = l + r;

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
