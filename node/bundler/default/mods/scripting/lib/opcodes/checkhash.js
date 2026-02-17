module.exports = {
  name: "CHECKHASH",
  description: "Verify that a preimage hashes to a given Blake3 hash.",
  exampleScript: {
    op: "CHECKHASH",
    hash: "<hash>"
  },
  exampleWitness: {
    input: "<secret>"
  },
  schema: {
    script: {
      hash: "string"
    },
    witness: {
      input: "string"
    }
  },
  execute: function (app, script, witness, vars, tx, blk) {
    try {
      const input = witness.input;
      const output = script.hash;
      if (!input || !output) { return false; }
      const hash = app.crypto.hash(input);
      return hash === output;
    } catch (err) {
      console.error("CHECKHASH error: ", err);
      return false;
    }
  }
};
