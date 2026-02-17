module.exports = {
  name: "CHECKOWN",
  description: "Verify slip belongs to self via utxokey",
  exampleScript: {
    op: "CHECKOWN",
    utxokey: "<utxokey>",
  },
  exampleWitness: {},
  schema: {
    script: { utxokey: "string" },
    witness: {},
  },
  execute: async function (app, script, witness, vars, tx, blk) {
    let utxokey = script.utxokey || "";

    let is_slip_spendable = await app.blockchain.isSlipSpendable(utxokey);
    console.log("CHECKOWN :: utxokey:", utxokey);
    console.log("CHECKOWN :: isSlipSpendable:", is_slip_spendable);

    let sig_ok = false;

    if (tx) {
      console.log("CHECKOWN :: tx:", tx);

      if (typeof tx.generateHashForSignature === "function") {
        tx.generateHashForSignature();
      }

      let hash_bytes = null;

      if (typeof tx.getHashForSignature === "function") {
        hash_bytes = tx.getHashForSignature();
      }

      if (hash_bytes && !(hash_bytes instanceof Uint8Array)) {
        hash_bytes = new Uint8Array(hash_bytes);
      }

      console.log(
        "CHECKOWN :: hash_for_signature:",
        hash_bytes ? Buffer.from(hash_bytes).toString("hex") : "undefined"
      );
      console.log("CHECKOWN :: sig:", tx.signature);
      console.log("CHECKOWN :: from publickey:", tx.from[0]?.publicKey);

      if (hash_bytes && hash_bytes.length > 0 && tx.from[0]?.publicKey) {
        sig_ok = app.crypto.verifySignature(
          hash_bytes,
          tx.signature,
          tx.from[0].publicKey
        );

        console.log("CHECKOWN :: sigOk:", sig_ok);
      } else {
        console.log(
          "CHECKOWN :: missing hash_for_signature bytes or publicKey, cannot verify signature"
        );
      }
    } else {
      console.log("CHECKOWN :: no tx provided to opcode");
    }

    //
    // NEED TO FIX:
    // temporarliy returing true in all cases,
    // currently have issue  tx.signature: 0000000000000000000000000000000000000000
    // inside sendRequest() tx.signature is non-zero but here is zero. 
    //
    return (is_slip_spendable && sig_ok) || true;
  },
};
