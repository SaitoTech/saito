// CHECKPATHHOP CONTRACT:
// - MUST be satisfiable using only { hops } + vars
// - MUST fully verify routing path internally
// - MUST NOT depend on external chain state
module.exports = {
  name: "CHECKPATHHOP",

  description:
    "Verify a routing path and assert conditions over selected hop(s) after applying selection criteria.",

  exampleScript: {
    op: "CHECKPATHHOP",

    selector: "FIRST", // FIRST | LAST | ONLY | ANY

    where: [
      {
        field: "value.delegation",
        operator: "==",
        value: 0,
        type: "number"
      }
    ],

    assert: [
      {
        field: "to",
        operator: "==",
        value: "REQUESTER"
      }
    ],

    publickey: "<creator_publickey>",
    hash: "<binding_hash_or_empty_string>"
  },

  exampleWitness: {
    hops : [
      {
        to: "<publickey>",
        value: "<base64_json_payload>",
        sig: "<hex_signature>"
      }
    ]
  },

  schema: {
    script: {
      selector: "string",
      where: "array",
      assert: "array",
      publickey: "string",
      hash: "string"
    },
    witness: {
      hops: "array"
    }
  },

  execute(app, script, witness, vars = {}, tx = null, blk = null) {
    try {

      /* --------------------------------------------------
       * 0. Basic input checks
       * -------------------------------------------------- */

      const path = witness?.hops;
      if (!Array.isArray(path) || path.length === 0) {
        return false;
      }

      const start_publickey = script.publickey;
      const binding_hash = script.hash || "";

      if (!start_publickey || typeof start_publickey !== "string") {
        return false;
      }


      /* --------------------------------------------------
       * 0.5 variables that may be needed....
       * -------------------------------------------------- */

      vars.REQUESTER = "";
      if (tx?.from.length > 0) {
        if (tx.from[0].publicKey) { vars.REQUESTER = tx.from[0].publicKey; }
      }
      vars.NOW = Date.now();


      /* --------------------------------------------------
       * 1. Cryptographic verification of routing path
       * -------------------------------------------------- */

      if (!app.crypto.verifyRoutingPath(
        path,
        start_publickey,
        binding_hash
      )) {
        return false;
      }

      /* --------------------------------------------------
       * 2. Decode hops into queryable objects
       * -------------------------------------------------- */

      const decoded = path.map(hop => ({
        to: hop.to,
        sig: hop.sig,
        value: JSON.parse(
          Buffer.from(hop.value, "base64").toString("utf8")
        )
      }));

      /* --------------------------------------------------
       * 3. WHERE filtering (AND semantics)
       * -------------------------------------------------- */

      let filtered = decoded;

      if (Array.isArray(script.where) && script.where.length > 0) {
        filtered = decoded.filter(hop => {
          return script.where.every(condition =>
            this.evaluateCondition(hop, condition, vars)
          );
        });
      }

      if (filtered.length === 0) {
        return false;
      }

      /* --------------------------------------------------
       * 4. Selector applied to filtered set
       * -------------------------------------------------- */

      let selected;

      switch (script.selector) {
        case "FIRST":
          selected = [filtered[0]];
          break;

        case "LAST":
          selected = [filtered[filtered.length - 1]];
          break;

        case "ONLY":
          if (filtered.length !== 1) return false;
          selected = [filtered[0]];
          break;

        case "ANY":
          selected = filtered;
          break;

        default:
          return false;
      }


if (vars?.__DEBUG_ACCESS__) {
  console.log("CHECKPATHHOP DEBUG", {
    decoded,
    filtered,
    selected,
    requester: vars.REQUESTER
  });
}


      /* --------------------------------------------------
       * 5. ASSERT conditions
       * -------------------------------------------------- */

      if (Array.isArray(script.assert) && script.assert.length > 0) {
        for (const hop of selected) {
          for (const assertion of script.assert) {
            if (!this.evaluateCondition(hop, assertion, vars)) {
              return false;
            }
          }
        }
      }

      return true;

    } catch (err) {
      console.error("CHECKPATHHOP error:", err);
      return false;
    }
  }
};

