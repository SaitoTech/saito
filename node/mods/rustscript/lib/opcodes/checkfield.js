/**
 * Purpose: CHECKFIELD opcode — compare resolved field values.
 */

module.exports = {
  name: 'CHECKFIELD',
  description: `
Compares two values (resolved via VARS or literals) using a comparison operator.
Returns true if the comparison holds.
`,
  exampleScript: {
    op: 'CHECKFIELD',
    field: '__opcodes.sumfields.expiry',
    operator: '>',
    value: 'NOW'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const operator = node.operator;
    if (typeof operator !== 'string' || operator.length === 0) {
      return false;
    }

    const left = resolveRef(context, node.field);
    let right = resolveRef(context, node.value);
    if (typeof right === 'string' && Object.prototype.hasOwnProperty.call(context, right)) {
      right = context[right];
    }

    if (left === undefined || right === undefined) {
      return false;
    }

    const lnum = Number(left);
    const rnum = Number(right);
    const l = Number.isFinite(lnum) ? lnum : left;
    const r = Number.isFinite(rnum) ? rnum : right;

    if (operator === '==' || operator === 'equals') {
      return l === r;
    }
    if (operator === '!=' || operator === 'notequals') {
      return l !== r;
    }
    if (operator === '<' || operator === 'lessthan') {
      return l < r;
    }
    if (operator === '<=' || operator === 'lessthanorequal') {
      return l <= r;
    }
    if (operator === '>' || operator === 'greaterthan') {
      return l > r;
    }
    if (operator === '>=' || operator === 'greaterthanorequal') {
      return l >= r;
    }

    return false;
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
