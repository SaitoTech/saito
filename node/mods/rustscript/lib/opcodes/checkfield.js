/**
 * Purpose: CHECKFIELD opcode — compare a resolved field value to a scalar or value list.
 *
 * Language shape:
 *   script.field     — value path / literal
 *   script.operator  — "==" | "!=" | "<" | ... | "IN" | "NOT"
 *   script.value     — scalar (== / != / ordering) OR array of candidates (IN / NOT)
 *
 * IN  → field value equals at least one list element
 * NOT → field value equals none of the list elements
 */

module.exports = {
  name: 'CHECKFIELD',
  description: `
Compares a resolved field value using a comparison operator.

== / equals     → equals scalar
!= / notequals  → not equal scalar
< <= > >=       → ordering (when both sides are comparable)
IN              → value equals at least one list element
NOT             → value equals none of the list elements
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
    if (left === undefined || left === null) {
      return false;
    }

    if (operator === 'IN' || operator === 'NOT') {
      let list = node.value;
      if (typeof list === 'string') {
        list = resolveRef(context, list);
      }
      if (!Array.isArray(list)) {
        return false;
      }

      let matched = false;
      for (let i = 0; i < list.length; i += 1) {
        let candidate = resolveRef(context, list[i]);
        if (typeof candidate === 'string' && Object.prototype.hasOwnProperty.call(context, candidate)) {
          candidate = context[candidate];
        }
        if (valuesEqual(left, candidate)) {
          matched = true;
          break;
        }
      }

      if (operator === 'IN') {
        return matched === true;
      }
      return matched === false;
    }

    let right = resolveRef(context, node.value);
    if (typeof right === 'string' && Object.prototype.hasOwnProperty.call(context, right)) {
      right = context[right];
    }

    if (right === undefined) {
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

function valuesEqual(left, right) {
  if (left === undefined || left === null || right === undefined || right === null) {
    return false;
  }

  if (typeof left === 'number' && Number.isFinite(left)) {
    return typeof right === 'number' && Number.isFinite(right) && left === right;
  }
  if (typeof left === 'string') {
    return typeof right === 'string' && left === right;
  }
  if (typeof left === 'boolean') {
    return typeof right === 'boolean' && left === right;
  }
  return false;
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
