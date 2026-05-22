module.exports = {
  name: 'CHECKRECIPIENT',
  description: 'Verify a transaction output pays the required publickey.',
  exampleScript: {
    op: 'CHECKRECIPIENT',
    publickey: '<publickey>'
  },
  exampleWitness: {},
  schema: {
    script: { publickey: 'string' },
    witness: {}
  },
  execute(app, script, witness, context) {
    try {
      const tx = context.tx;
      const required = script.publickey || null;
      if (!required) {
        return false;
      }

      const outputs = tx?.to ?? tx?.outputs ?? [];
      const required_lc = String(required).toLowerCase();

      for (const slip of outputs) {
        const pk = slip?.publicKey ?? slip?.publickey ?? slip?.address;
        if (pk && String(pk).toLowerCase() === required_lc) {
          return true;
        }
      }

      const tx_to = context['tx.to'] ?? tx?.to;
      if (tx_to && String(tx_to).toLowerCase() === required_lc) {
        return true;
      }

      return false;
    } catch (err) {
      console.error('CHECKRECIPIENT execute error:', err);
      return false;
    }
  }
};
