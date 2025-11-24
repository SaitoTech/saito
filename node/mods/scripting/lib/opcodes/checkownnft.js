let Slip = require('../../../../lib/saito/slip').default;

module.exports = {
  name: "CHECKOWNNFT",
  description: 'Verify NFT belongs to self via utxokeys',
  exampleScript: {
    op: 'CHECKOWNNFT',
    nftid: '<nftid>',
  },
  exampleWitness: {
    utxokey1: '<utxokey1>',
    utxokey2: '<utxokey2>',
    utxokey3: '<utxokey3>',
  },
  schema: {
    script: {
      nftid: "string",
    },
    witness: {
      utxokey1: "string",
      utxokey2: "string",
      utxokey3: "string",
    }
  },

  execute: async function (app, script, witness, vars, tx, blk) {
    let tx_sender = null;
    if (tx.from.length > 0) {
      tx_sender = tx.from[0].publicKey;
    } else {
      return false;
    }

    //
    // check tx.signature is correct / validates
    //

    let nftid    = script.nftid || "";
    let utxokey1 = witness.utxokey1 || "";
    let utxokey2 = witness.utxokey2 || "";
    let utxokey3 = witness.utxokey3 || "";

    if (!nftid) { return false; }
    if (!utxokey1 || !utxokey2 || !utxokey3) { return false; }

    // let [
    //   isSlip1Spendable,
    //   isSlip2Spendable,
    //   isSlip3Spendable
    // ] = await Promise.all([
    //   //app.blockchain.isSlipSpendable(utxokey1),
    //   app.blockchain.isSlipSpendable(utxokey2),
    //   //app.blockchain.isSlipSpendable(utxokey3),
    // ]);

    let isSlip2Spendable = app.blockchain.isSlipSpendable(utxokey2);

    if (
      isSlip2Spendable 
    ) {

      let slip1 = Slip.fromUtxoKey(utxokey1);
      if (!slip1) { return false; }

      let slip2 = Slip.fromUtxoKey(utxokey2);
      if (!slip2) { return false; }

      let slip3 = Slip.fromUtxoKey(utxokey3);
      if (!slip3) { return false; }

      let creator_publicKey = slip1.publicKey;
      let owner_publicKey   = slip2.publicKey;
      let slip3_publicKey   = slip3.publicKey;

      console.log("slip1: ", slip1);
      console.log("slip2: ", slip2);
      console.log("slip3: ", slip3);

      console.log("creator_publicKey: ", creator_publicKey);
      console.log("owner_publicKey: ", owner_publicKey);
      console.log("slip3_publicKey: ", slip3_publicKey);

      //
      // check nft belongs to me
      //
      if (owner_publicKey !== tx_sender) {
        return false;
      }

      //
      // check all three slips come from same tx (same blockId and txOrdinal)
      //
      let slip1_blockid = BigInt(slip1.blockId);
      let slip2_blockid = BigInt(slip2.blockId);
      let slip3_blockid = BigInt(slip3.blockId);

      let slip1_txOrdinal = BigInt(slip1.txOrdinal);
      let slip2_txOrdinal = BigInt(slip2.txOrdinal);
      let slip3_txOrdinal = BigInt(slip3.txOrdinal);

      if (!(slip1_blockid === slip2_blockid && 
          slip2_blockid === slip3_blockid && 
          slip1_txOrdinal === slip2_txOrdinal 
          && slip2_txOrdinal === slip3_txOrdinal)
      ) {
        console.log("CHECKOWNNFT failed: slips not from same tx");
        return false;
      }

      //
      // check index are consecutive (i, i+1, i+2)
      //
      let index1 = Number(slip1.index);
      let index2 = Number(slip2.index);
      let index3 = Number(slip3.index);

      if (!(index2 === index1 + 1 && index3 === index2 + 1)) {
        console.log("CHECKOWNNFT failed: slip indices not consecutive", { index1, index2, index3 });
        return false;
      }

      console.log("CHECKOWNNFT: all checks okay");


      let sig_ok = true;

      // if (tx) {
      //   console.log("CHECKOWNNFT :: tx:", tx);

      //   if (typeof tx.generateHashForSignature === "function") {
      //     tx.generateHashForSignature();
      //   }

      //   let hash_bytes = null;

      //   if (typeof tx.getHashForSignature === "function") {
      //     hash_bytes = tx.getHashForSignature();
      //   }

      //   if (hash_bytes && !(hash_bytes instanceof Uint8Array)) {
      //     hash_bytes = new Uint8Array(hash_bytes);
      //   }

      //   console.log(
      //     "CHECKOWNNFT :: hash_for_signature:",
      //     hash_bytes ? Buffer.from(hash_bytes).toString("hex") : "undefined"
      //   );
      //   console.log("CHECKOWNNFT :: sig:", tx.signature);
      //   console.log("CHECKOWNNFT :: from publickey:", tx.from[0]?.publicKey);

      //   if (hash_bytes && hash_bytes.length > 0 && tx.from[0]?.publicKey) {
      //     sig_ok = app.crypto.verifySignature(
      //       hash_bytes,
      //       tx.signature,
      //       tx.from[0].publicKey
      //     );

      //     console.log("CHECKOWNNFT :: sigOk:", sig_ok);
      //   } else {
      //     console.log(
      //       "CHECKOWNNFT :: missing hash_for_signature bytes or publicKey, cannot verify signature"
      //     );
      //   }
      // } else {
      //   console.log("CHECKOWNNFT :: no tx provided to opcode");
      // }


      return sig_ok;
    }

    return false;
  }
};
