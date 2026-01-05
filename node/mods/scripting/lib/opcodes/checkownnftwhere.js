const Slip = require("../../../../lib/saito/slip");

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
    slips: [
      "<utxokey1>",
      "<utxokey2>",
      "<utxokey3>"
    ]
  },

  schema: {
    script: {
      where: "array"
    },
    witness: {
      slips: "array"
    }
  },


  execute(app, script, witness, vars, tx, blk) {

    if (!witness?.slips || witness.slips.length !== 3) {
      return false;
    }

    const [utxo1, utxo2, utxo3] = witness.slips;

    const slip1 = Slip.fromUtxoKey(utxo1);
    const slip2 = Slip.fromUtxoKey(utxo2);
    const slip3 = Slip.fromUtxoKey(utxo3);

    if (!slip1 || !slip2 || !slip3) {
      return false;
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
    const nft_type = app.wallet.extractNFTType(slip3.utxo_key);
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

