/**
 * Purpose: CHECKPATHHOP opcode — verify routing path, filter hops, assert, write hop to __opcodes.
 */

module.exports = {
  name: 'CHECKPATHHOP',
  description:
    'Verify a routing path and assert conditions over selected hop(s) after applying selection criteria.',
  exampleScript: {
    op: 'CHECKPATHHOP',
    selector: 'FIRST',
    where: [
      {
        field: 'value.delegation',
        operator: '==',
        value: 0,
        type: 'number'
      }
    ],
    assert: [
      {
        field: 'to',
        operator: '==',
        value: 'REQUESTER'
      }
    ],
    publickey: '<creator_publickey>',
    witness: {
      hops: [
        {
          to: '<publickey>',
          value: '<base64_json_payload>',
          sig: '<hex_signature>'
        }
      ]
    }
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }
    if (
      !context.app ||
      !context.app.crypto ||
      typeof context.app.crypto.verifyRoutingPath !== 'function'
    ) {
      return false;
    }

    const witness = node.witness;
    if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
      return false;
    }

    const path = witness.hops;
    if (!Array.isArray(path) || path.length === 0) {
      return false;
    }

    let start_publickey = resolveRef(context, node.publickey);
    if (typeof start_publickey !== 'string' || start_publickey.length === 0) {
      return false;
    }

    let binding_hash = resolveRef(context, node.hash);
    if (typeof binding_hash !== 'string') {
      binding_hash = '';
    }

    if (context.app.crypto.verifyRoutingPath(path, start_publickey, binding_hash) !== true) {
      return false;
    }

    const decoded = [];
    for (let h = 0; h < path.length; h += 1) {
      const hop = path[h];
      if (!hop || typeof hop !== 'object' || typeof hop.value !== 'string') {
        return false;
      }
      const parsed = JSON.parse(Buffer.from(hop.value, 'base64').toString('utf8'));
      decoded.push({
        to: hop.to,
        sig: hop.sig,
        value: parsed
      });
    }

    let filtered = decoded;
    if (Array.isArray(node.where) && node.where.length > 0) {
      filtered = [];
      for (let d = 0; d < decoded.length; d += 1) {
        const hop = decoded[d];
        let match = true;
        for (let w = 0; w < node.where.length; w += 1) {
          if (evaluateCondition(hop, node.where[w], context) !== true) {
            match = false;
            break;
          }
        }
        if (match) {
          filtered.push(hop);
        }
      }
    }

    if (filtered.length === 0) {
      return false;
    }

    let selected = [];
    const selector = node.selector;
    if (selector === 'FIRST') {
      selected = [filtered[0]];
    } else if (selector === 'LAST') {
      selected = [filtered[filtered.length - 1]];
    } else if (selector === 'ONLY') {
      if (filtered.length !== 1) {
        return false;
      }
      selected = [filtered[0]];
    } else if (selector === 'ANY') {
      selected = filtered;
    } else {
      return false;
    }

    if (Array.isArray(node.assert) && node.assert.length > 0) {
      let assertion_satisfied = false;
      for (let s = 0; s < selected.length; s += 1) {
        const hop = selected[s];
        for (let a = 0; a < node.assert.length; a += 1) {
          const result = evaluateCondition(hop, node.assert[a], context);
          if (result !== true && result !== false) {
            return false;
          }
          if (result === false) {
            return false;
          }
          if (result === true) {
            assertion_satisfied = true;
          }
        }
      }
      if (!assertion_satisfied) {
        return false;
      }
    }

    const winning_hop = selected[0];
    if (!context.__opcodes) {
      context.__opcodes = {};
    }
    if (!context.__opcodes.checkpathhop) {
      context.__opcodes.checkpathhop = {};
    }
    context.__opcodes.checkpathhop.hop = {
      to: winning_hop.to,
      sig: winning_hop.sig,
      value: winning_hop.value
    };

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

function evaluateCondition(hopContext, condition, context) {
  if (!condition || typeof condition !== 'object') {
    return false;
  }

  const field = condition.field;
  const operator = condition.operator;
  const value = condition.value;
  const type = condition.type;

  if (typeof field !== 'string' || typeof operator !== 'string') {
    return false;
  }

  const parts = field.split('.');
  let lhs = hopContext;
  for (let i = 0; i < parts.length; i += 1) {
    if (!lhs || typeof lhs !== 'object') {
      lhs = undefined;
      break;
    }
    lhs = lhs[parts[i]];
  }

  let rhs = value;
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(context, value)) {
    rhs = context[value];
  }

  const coerce = (v) => {
    if (!type) {
      return v;
    }
    if (type === 'number') {
      return Number(v);
    }
    if (type === 'string') {
      return String(v);
    }
    if (type === 'boolean') {
      if (v === true || v === false) {
        return v;
      }
      if (v === 'true') {
        return true;
      }
      if (v === 'false') {
        return false;
      }
      if (v === 1) {
        return true;
      }
      if (v === 0) {
        return false;
      }
      return false;
    }
    return v;
  };

  const left = coerce(lhs);
  const right = coerce(rhs);

  if (operator === '==') {
    return left === right;
  }
  if (operator === '!=') {
    return left !== right;
  }
  if (operator === '<') {
    return left < right;
  }
  if (operator === '<=') {
    return left <= right;
  }
  if (operator === '>') {
    return left > right;
  }
  if (operator === '>=') {
    return left >= right;
  }

  return false;
}
