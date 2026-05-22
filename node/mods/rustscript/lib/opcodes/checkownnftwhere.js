const Slip = require('./../../../../lib/saito/slip').default;


module.exports = {

  name: "CHECKOWNNFTWHERE",

  description: `
Checks that:
1. The submitted NFT is spendable by the transaction sender (tx.from === slip2.publicKey)
2. Additional WHERE constraints hold over NFT metadata (creator, type)

Witness must include:
  witness.slips = [ utxoKey1, utxoKey2, utxoKey3 ]
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

  exampleWitness: {
    utxokey1 : "<string>" ,
    utxokey2 : "<string>" ,
    utxokey3 : "<string>" 
  },

  schema: {
    script: {
      where: "array"
    },
    witness: {
      utxokey1 : "string" ,
      utxokey2 : "string" ,
      utxokey3 : "string" ,
    }
  },


  execute(app, script, witness, context) {
    const tx = context.tx;

    let utxo1 = witness.utxokey1 || null;
    let utxo2 = witness.utxokey2 || null;
    let utxo3 = witness.utxokey3 || null;

    if (!utxo1 || !utxo2 || !utxo3) { return false; }

    const slip1 = Slip.fromUtxoKey(utxo1);
    const slip2 = Slip.fromUtxoKey(utxo2);
    const slip3 = Slip.fromUtxoKey(utxo3);

    if (!slip1 || !slip2 || !slip3) {
      return false;
    }

    //
    // write to OPCODE
    //
    try {
      context.__opcodes.checkownnftwhere = {};
      // 66 bytes from utxokey 3 = nft.id
      context.__opcodes.checkownnftwhere.nft_id = utxo3.substring(0, 66).toLowerCase();
console.log("**** CHECKOWNNFTWHERE produced nft_id of: " + context.__opcodes.checkownnftwhere.nft_id);
console.log("**** CHECKOWNNFTWHERE produced length: " + context.__opcodes.checkownnftwhere.nft_id.length);
    } catch (err) {
      context.__opcodes.checkownnftwhere = { nft_id: "" };
    }



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
    const nft_type = app.wallet.extractNFTType(utxo3);
    const creator  = slip1.publicKey;

    // --------------------------------------------------
    // WHERE clause evaluation
    // --------------------------------------------------
    if (Array.isArray(script.where)) {

      for (const clause of script.where) {

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

