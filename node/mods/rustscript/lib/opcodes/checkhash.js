module.exports = {
  name: "CHECKHASH",
  description: "Verify that a preimage hashes to a given Blake3 hash.",
  exampleScript: {
    op: "CHECKHASH",
    hash: "<hash>"
  },
  exampleRequired: {
    input: "<secret>"
  },
  schema: {
    script: {
      hash: "string"
    },
    required: {
      input: "string"
    }
  },
  execute: function (node, context) {
    const required = node.required || {};
    const input = required.input;
    const output = node.hash;
    if (input === true || !input || !output) {
      return false;
    }
    const hash = context.app.crypto.hash(input);
    return hash === output;
  }
};
