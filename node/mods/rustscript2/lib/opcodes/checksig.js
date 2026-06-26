const { lookupField, isUnsetFieldValue } = require('./field_lookup');

module.exports = {
  name: "CHECKSIG",
  description: 'Verify a signature against a message.',
  exampleScript: {
    op: 'CHECKSIG',
    publickey: '<publickey>',
    msg: '<text>'
  },
  exampleRequired: {
    signature: '<signature>'
  },
  schema: {
    script: { publickey: "string", msg: "string" },
    required: { signature: "string" }
  },
  execute: function (node, context) {
    const signature = lookupField(node, 'signature');
    if (isUnsetFieldValue(signature)) {
      return false;
    }
    const msg = node.msg || "";
    const publickey = node.publickey || "";
    return context.app.crypto.verifyMessage(msg, signature, publickey);
  }
};
