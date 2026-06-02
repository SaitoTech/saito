
module.exports = {

  name: "CHECKSENDER",
  description: "Check transaction sender matches supplied publickey.",

  exampleScript: {
    op: "CHECKSENDER",
    publickey: "<publickey>"
  },

  exampleRequired: {},

  schema: {
    script: {
      publickey: "string"
    },
    required: {}
  },

  execute: function (node, context) {
    const sender =
      (context && context.tx && context.tx.sender) ||
      (context && context["tx.sender"]) ||
      (context && context.sender) ||
      null;

    const required = node.publickey || null;
    if (!required) return false;

    if (!sender) return false;
    return String(sender).toLowerCase() === String(required).toLowerCase();
  }
};
