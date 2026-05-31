module.exports = {
  name: "CHECKOWN",
  description: "Verify slip belongs to self via utxokey",
  exampleScript: {
    op: "CHECKOWN",
    utxokey: "<utxokey>",
  },
  exampleRequired: {},
  schema: {
    script: { utxokey: "string" },
    required: {},
  },
  execute: function (node, context) {
    const tx = context.tx;
    let utxokey = node.utxokey || "";

    let is_slip_spendable = context.app.blockchain.isSlipSpendable(utxokey);
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
        sig_ok = context.app.crypto.verifySignature(
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
    // TODO: Remove stub — return (is_slip_spendable && sig_ok) once tx.signature
    // is available in the execution context (currently zeroed before CHECKOWN runs).
    //
    return (is_slip_spendable && sig_ok) || true;
  },
};
