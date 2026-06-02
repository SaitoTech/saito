/**
 * Purpose: CHECKRECIPIENT opcode — verify transaction pays script publickey.
 */

module.exports = {
  name: 'CHECKRECIPIENT',
  description: 'Verify a transaction output pays the required publickey.',
  exampleScript: {
    op: 'CHECKRECIPIENT',
    publickey: '<publickey>'
  },
  schema: {
    publickey: 'publickey'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const tx = context.tx;
    if (!tx || typeof tx !== 'object' || Array.isArray(tx)) {
      return false;
    }

    const publickey = node.publickey;
    if (typeof publickey !== 'string' || publickey.length === 0) {
      return false;
    }

    const required = publickey.toLowerCase();
    const outputs = tx.to;
    if (Array.isArray(outputs)) {
      for (let i = 0; i < outputs.length; i += 1) {
        const slip = outputs[i];
        if (!slip || typeof slip !== 'object') {
          continue;
        }
        const pk = slip.publicKey || slip.publickey || slip.address;
        if (typeof pk === 'string' && pk.toLowerCase() === required) {
          return true;
        }
      }
      return false;
    }

    if (typeof outputs === 'string' && outputs.length > 0) {
      return outputs.toLowerCase() === required;
    }

    const altOutputs = tx.outputs;
    if (Array.isArray(altOutputs)) {
      for (let i = 0; i < altOutputs.length; i += 1) {
        const slip = altOutputs[i];
        if (!slip || typeof slip !== 'object') {
          continue;
        }
        const pk = slip.publicKey || slip.publickey || slip.address;
        if (typeof pk === 'string' && pk.toLowerCase() === required) {
          return true;
        }
      }
    }

    return false;
  }
};
