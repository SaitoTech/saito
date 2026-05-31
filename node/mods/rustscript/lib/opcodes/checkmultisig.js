
module.exports = {
  name: "CHECKMULTISIG",
  description: "Verify M-of-N signatures" ,

  exampleScript: {
    op: "CHECKMULTISIG",
    m: 2,
    publickeys: ["<publickey>", "<publickey>", "<publickey>"],
    msg: '<text>'
  },
  exampleRequired: {
    signatures: ["<signature>", "<signature>"]
  },
  schema: {
    script: {
      publickeys: "array:string",
      m: "number",
      msg: "string"
    },
    required: {
      signatures: "array:string"
    }
  },

  execute: function (node, context) {

    const required = node.required || {};
    const publickeys = node.publickeys || [];
    const m = node.m || publickeys.length;
    const msg = node.msg || (context ? context.message : "") || "";
    const signatures = required.signatures;
    if (signatures === true || !Array.isArray(signatures) || signatures.length === 0) {
      return false;
    }

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
        if (context.app.crypto.verifyMessage(msg, signature, publickey)) {
          used.add(publickey);
          valid++;
          break;
        }
      }
      if (valid >= m) { break; }
    }

    return valid >= m;
  }
};
