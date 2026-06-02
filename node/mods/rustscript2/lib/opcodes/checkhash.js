const { lookupField, isUnsetFieldValue } = require('./field_lookup');

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
    const input = lookupField(node, 'input');
    const output = node.hash;
    if (isUnsetFieldValue(input) || !output) {
      return false;
    }
    const hash = context.app.crypto.hash(input);
    return hash === output;
  }
};
