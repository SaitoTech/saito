module.exports = {
  name: "CHECKPATH",

  description:
    "Verify a routing capability path provided in the witness, starting from a claimed authority root and bound to a static hash.",

  exampleScript: {
    op: "CHECKPATH",
    publickey: "<publickey>",
    hash: "<hash (optional)>"
  },

  exampleWitness: {
    path: [
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
    witness: {
      path: "array"
    }
  },

  execute(app, script, witness, vars, tx, blk) {
    try {

      const start_publickey = script.publickey;
      const binding_hash = script.hash || "";

      if (!start_publickey || typeof start_publickey !== "string") {
        return false;
      }

      const path = witness?.path;

      if (!Array.isArray(path) || path.length === 0) {
        return false;
      }

      return app.crypto.verifyRoutingPath(
        path,
        start_publickey,
        binding_hash
      );

    } catch (err) {
      console.error("CHECKPATH error:", err);
      return false;
    }
  }
};

