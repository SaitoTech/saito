
module.exports = {
  name: "CHECKMULTISIG",
  description: "Verify M-of-N signatures" ,

  exampleScript: {
    op: "CHECKMULTISIG",
    m: 2,
    publickeys: ["<publickey>", "<publickey>", "<publickey>"],
    msg: "hello world"
  },
  exampleWitness: {
    signatures: ["<signature>", "<signature>"]
  },
  schema: {
    script: {
      publickeys: "array:string",
      m: "number",
      msg: "string"
    },
    witness: {
      signatures: "array:string"
    }
  },

  execute: function (app, script, witness, vars, tx, blk) {

    const publickeys = script.publickeys || [];
    const m = script.m || publickeys.length;
    const msg = script.msg || (vars ? vars.message : "") || "";
    const signatures = witness.signatures || [];

    if (!Array.isArray(publickeys) || publickeys.length === 0) {
      console.warn("CHECKMULTISIG: no publickeys provided");
      return false;
    }

    if (!Array.isArray(signatures) || signatures.length === 0) {
      console.warn("CHECKMULTISIG: no signatures provided");
      return false;
    }

    let valid = 0;
    const used = new Set();

    for (let signature of signatures) {
      for (let publickey of publickeys) {
        if (used.has(publickey)) { continue; }
        try {
          if (app.crypto.verifyMessage(msg, signature, publickey)) {
            used.add(publickey);
            valid++;
            break;
          }
        } catch (err) {
          console.warn("CHECKMULTISIG verify error: ", err);
          continue;
        }
      }
      if (valid >= m) { break; }
    }

    return valid >= m;
  }
};

