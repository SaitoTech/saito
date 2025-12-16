module.exports = {
  name: "CHECKSIG",
  description: 'Verify a signature against a message.',
  exampleScript: {
    op: 'CHECKSIG',
    publickey: '<publickey>',
    msg: 'hello world'
  },
  exampleWitness: {
    signature: '<signature>'
  },
  schema: {
    script: { publickey: "string", msg: "string" },
    witness: { signature: "string" }
  },
  execute: function (app, script, witness, vars, tx, blk) {
    const signature = witness.signature || "";
    const msg = script.msg || "";
    const publickey = script.publickey || "";
    return app.crypto.verifyMessage(msg, signature, publickey);
  }
};

