const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * Symbolic: copy field into context[as].
 * Legacy signed import when publickey + hash + witness signature present.
 *
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function importfield(app, opcode, context) {
  const field_ref = opcode.field;
  const alias = opcode.as;

  if (!field_ref) {
    return false;
  }

  const signer_pubkey = resolve_symbol(context, opcode.publickey);
  const binding_hash = resolve_symbol(context, opcode.hash);

  if (signer_pubkey && binding_hash && app?.crypto) {
    const field_name = String(field_ref);
    const value = resolve_symbol(context, context.witness?.[field_name] ?? `witness.${field_name}`);
    const signature = resolve_symbol(context, opcode.signature ?? `witness.${opcode.sig ?? 'signature'}`);

    if (value === undefined || value === null || !signature) {
      return false;
    }

    const digest = app.crypto.hash(`${value}|${binding_hash}`);
    const valid = app.crypto.verifyMessage(digest, String(signature), String(signer_pubkey));
    if (!valid) {
      return false;
    }

    if (alias) {
      context[alias] = value;
    } else {
      context[field_name] = value;
    }
    return true;
  }

  const value = resolve_symbol(context, field_ref);
  if (value === undefined || value === null) {
    return false;
  }

  if (alias) {
    context[alias] = value;
  } else {
    const key = String(field_ref).split('.').pop();
    context[key] = value;
  }

  return true;
}

importfield.witness_fields = ['signature'];

importfield.resolve_witness_fields = function (opcode) {
  const fields = ['signature'];
  const ref = opcode ? opcode.field : null;
  if (ref) {
    const key = String(ref).split('.').pop();
    if (key && fields.indexOf(key) === -1) {
      fields.unshift(key);
    }
  }
  return fields;
};

module.exports = importfield;
