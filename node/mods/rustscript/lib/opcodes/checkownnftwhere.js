const Slip = require('./../../../../lib/saito/slip').default;


module.exports = {

  name: "CHECKOWNNFTWHERE",

  description: `
Checks that:
1. The submitted NFT is spendable by the transaction sender (tx.from === slip2.publicKey)
2. Additional WHERE constraints hold over NFT metadata (creator, type)

Required fields:
  utxokey1, utxokey2, utxokey3
`,

  exampleScript: {
    op: "CHECKOWNNFTWHERE",
    where: [
      {
        field: "creator",
        operator: "==",
        value: "<publickey>"
      },
      {
        field: "type",
        operator: "==",
        value: "stack"
      }
    ]
  },

  exampleRequired: {
    utxokey1 : "<string>" ,
    utxokey2 : "<string>" ,
    utxokey3 : "<string>" 
  },

  schema: {
    script: {
      where: "array"
    },
    required: {
      utxokey1 : "string" ,
      utxokey2 : "string" ,
      utxokey3 : "string" ,
    }
  },


  execute(node, context) {
    const tx = context.tx;

    const required = node.required || {};
    let utxo1 = required.utxokey1;
    let utxo2 = required.utxokey2;
    let utxo3 = required.utxokey3;

    if (utxo1 === true || utxo2 === true || utxo3 === true) { return false; }
    if (!utxo1 || !utxo2 || !utxo3) { return false; }

    const slip1 = Slip.fromUtxoKey(utxo1);
    const slip2 = Slip.fromUtxoKey(utxo2);
    const slip3 = Slip.fromUtxoKey(utxo3);

    if (!slip1 || !slip2 || !slip3) {
      return false;
    }

    if (!context.__opcodes) { context.__opcodes = {}; }
    context.__opcodes.checkownnftwhere = {};
    context.__opcodes.checkownnftwhere.nft_id = utxo3.substring(0, 66).toLowerCase();

    // --------------------------------------------------
    // Ownership check (runtime only)
    // --------------------------------------------------
    if (tx?.from?.length > 0) {
      const sender = tx.from[0].publicKey;
      if (sender !== slip2.publicKey) {
        return false;
      }
    }

    // --------------------------------------------------
    // Extract NFT metadata
    // --------------------------------------------------
    const nft_type = context.app.wallet.extractNFTType(utxo3);
    const creator  = slip1.publicKey;

    // --------------------------------------------------
    // WHERE clause evaluation
    // --------------------------------------------------
    if (Array.isArray(node.where)) {

      for (const clause of node.where) {

        let lhs;

        switch (clause.field) {
          case "creator":
            lhs = creator;
            break;
          case "type":
            lhs = nft_type;
            break;
          default:
            return false;
        }

        const rhs = clause.value;

        switch (clause.operator) {
          case "==":
            if (lhs !== rhs) { return false; }
            break;
          case "!=":
            if (lhs === rhs) { return false; }
            break;
          default:
            return false;
        }
      }
    }

    return true;
  }
};

