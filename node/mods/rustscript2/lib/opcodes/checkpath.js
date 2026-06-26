const { lookupField, isUnsetFieldValue } = require('./field_lookup');

module.exports = {
  name: "CHECKPATH",

  description:
    "Verify a routing capability path provided at unlock time, starting from a claimed authority root and bound to a static hash.",

  exampleScript: {
    op: "CHECKPATH",
    publickey: "<publickey>",
    hash: "<hash (optional)>"
  },

  exampleRequired: {
    hops: [
      {
        to: "<publickey>",
        value: "<base64_json_payload>",
        sig: "<signature>"
      }
    ]
  },

  schema: {
    script: {
      publickey: "string",
      hash: "string"
    },
    required: {
      hops: "array"
    }
  },

  execute(node, context) {
    const start_publickey = node.publickey;
    const binding_hash = node.hash || "";

    if (!start_publickey || typeof start_publickey !== "string") {
      return false;
    }

    const path = lookupField(node, 'hops');
    if (isUnsetFieldValue(path) || !Array.isArray(path) || path.length === 0) {
      return false;
    }

    return context.app.crypto.verifyRoutingPath(
      path,
      start_publickey,
      binding_hash
    );
  }
};
