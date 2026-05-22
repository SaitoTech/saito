const { resolve_symbol, evaluate_condition } = require('../rustscript/ast_execute');

function evaluate_hop_condition(hop, condition, context) {
  const field = condition.field;
  const operator = condition.operator;
  let rhs = condition.value;

  const lhs = field.split('.').reduce((obj, key) => (obj != null ? obj[key] : undefined), hop);

  if (rhs === 'REQUESTER') {
    rhs =
      context.requester ??
      context.REQUESTER ??
      resolve_symbol(context, 'context.requester') ??
      resolve_symbol(context, 'tx.sender');
  } else {
    rhs = resolve_symbol(context, rhs);
  }

  return evaluate_condition(lhs, rhs, operator);
}

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checkpathhop(app, opcode, context) {
  const path = opcode.hops ?? context.witness?.hops;
  if (!Array.isArray(path) || path.length === 0) {
    return false;
  }

  const start_publickey = resolve_symbol(context, opcode.publickey);
  let binding_hash = resolve_symbol(context, opcode.hash);
  if (typeof binding_hash !== 'string' || !binding_hash.length) {
    binding_hash = '';
  }

  if (!app?.crypto || !start_publickey) {
    return false;
  }

  if (!app.crypto.verifyRoutingPath(path, start_publickey, binding_hash)) {
    return false;
  }

  const decoded = path.map((hop) => ({
    to: hop.to,
    sig: hop.sig,
    value: JSON.parse(Buffer.from(hop.value, 'base64').toString('utf8'))
  }));

  let filtered = decoded;
  if (Array.isArray(opcode.where) && opcode.where.length > 0) {
    filtered = decoded.filter((hop) =>
      opcode.where.every((cond) => evaluate_hop_condition(hop, cond, context))
    );
  }

  if (filtered.length === 0) {
    return false;
  }

  let selected;
  switch (opcode.selector) {
    case 'FIRST':
      selected = [filtered[0]];
      break;
    case 'LAST':
      selected = [filtered[filtered.length - 1]];
      break;
    case 'ONLY':
      if (filtered.length !== 1) {
        return false;
      }
      selected = [filtered[0]];
      break;
    case 'ANY':
      selected = filtered;
      break;
    default:
      return false;
  }

  if (!selected?.length || selected.some((h) => !h)) {
    return false;
  }

  if (Array.isArray(opcode.assert) && opcode.assert.length > 0) {
    let satisfied = false;
    for (const hop of selected) {
      for (const assertion of opcode.assert) {
        const result = evaluate_hop_condition(hop, assertion, context);
        if (result !== true && result !== false) {
          return false;
        }
        if (result === false) {
          return false;
        }
        if (result === true) {
          satisfied = true;
        }
      }
    }
    if (!satisfied) {
      return false;
    }
  }

  const winning_hop = selected[0];
  context.checkpathhop_hop = {
    to: winning_hop.to,
    sig: winning_hop.sig,
    value: winning_hop.value
  };
  if (winning_hop.value?.activation_time !== undefined) {
    context.activation_time = winning_hop.value.activation_time;
  }

  return true;
}

checkpathhop.witness_fields = ['hops'];

module.exports = checkpathhop;
