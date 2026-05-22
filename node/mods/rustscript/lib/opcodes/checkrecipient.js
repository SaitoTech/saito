const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * Verify a transaction output pays the required publickey.
 *
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checkrecipient(app, opcode, context) {
  const required = resolve_symbol(context, opcode.publickey);
  if (!required) {
    return false;
  }

  const tx = context.tx;
  const outputs = tx?.to ?? tx?.outputs ?? [];
  const required_lc = String(required).toLowerCase();

  for (const slip of outputs) {
    const pk = slip?.publicKey ?? slip?.publickey ?? slip?.address;
    if (pk && String(pk).toLowerCase() === required_lc) {
      return true;
    }
  }

  const tx_to = resolve_symbol(context, 'tx.to');
  if (tx_to && String(tx_to).toLowerCase() === required_lc) {
    return true;
  }

  return false;
}

module.exports = checkrecipient;
