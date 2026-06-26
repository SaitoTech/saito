// CHECKPATHHOP CONTRACT:
// - MUST be satisfiable using only { hops } + vars
// - MUST fully verify routing path internally
// - MUST NOT depend on external chain state
const { lookupField, isUnsetFieldValue } = require('./field_lookup');

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

    publickey: "<creator_publickey>"
  },

  exampleRequired: {
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
      publickey: "string"
    },
    required: {
      hops: "array"
    }
  },

  execute(node, context) {

console.log("EXECUTING CHECKPATHHOP...");

      /* --------------------------------------------------
       * 0. Basic input checks
       * -------------------------------------------------- */

      const path = lookupField(node, 'hops');
      if (isUnsetFieldValue(path) || !Array.isArray(path) || path.length === 0) {
        return false;
      }

console.log("CPH 2");
      const start_publickey = context.app.browser.resolveVarReference(context, node.publickey);
console.log("CPH 3");
      let binding_hash = context.app.browser.resolveVarReference(context, node.hash);
console.log("CPH 4: " + binding_hash.length);
      if (typeof binding_hash !== "string" || !binding_hash.length) { binding_hash = ""; }
console.log("CPH 5");
      if (!start_publickey || typeof start_publickey !== "string") { return false; }
console.log("CPH 6");

      /* --------------------------------------------------
       * 1. Cryptographic verification of routing path
       * -------------------------------------------------- */

console.log("starting publickey: " + start_publickey);
console.log("binding hash: " + binding_hash);

      if (!context.app.crypto.verifyRoutingPath(
        path,
        start_publickey,
        binding_hash
      )) {
console.log("ROUTING PATH DOES NOT VERIFY: -- return false");
        return false;
      }

console.log("ROUTING PATH VERIFIES!");

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

      if (Array.isArray(node.where) && node.where.length > 0) {
        filtered = decoded.filter(hop => {
          return node.where.every(condition =>
            this.evaluateCondition(hop, condition, context)
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

      switch (node.selector) {
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

      if (!Array.isArray(selected) || selected.length === 0 || selected.some(h => !h)) {
        return false;
      }

if (context?.__DEBUG_ACCESS__) {
  console.log("CHECKPATHHOP DEBUG", {
    decoded,
    filtered,
    selected,
    requester: context.REQUESTER
  });
}

      const winning_hop = selected[0];


	/* --------------------------------------------------
	 * 5. ASSERT conditions
	 * -------------------------------------------------- */
	if (Array.isArray(node.assert) && node.assert.length > 0) {

console.log("ASSERT EXISTS...");

  let assertion_satisfied = false;

  for (const hop of selected) {
console.log("HOP EXISTS...");
    for (const assertion of node.assert) {
      const result = this.evaluateCondition(hop, assertion, context);

console.log("does the result hold: " + result);

      // Any non-boolean result is a failure (prevents vacuous success)
      if (result !== true && result !== false) {
        return false;
      }

      if (result === false) {
        return false;
      }

      if (result === true) {
        assertion_satisfied = true;
      }
    }
  }

  if (!assertion_satisfied) {
    return false;
  }
}



  // ensure opcode namespace
  if (!context.__opcodes) { context.__opcodes = {}; }
  if (!context.__opcodes.checkpathhop) { context.__opcodes.checkpathhop = {}; }

  // write structured data
  context.__opcodes.checkpathhop.hop = {
    to: winning_hop.to,
    sig: winning_hop.sig,
    value: winning_hop.value
  };

console.log("VARS is set in CHECKPATHHOP: " + JSON.stringify(context.__opcodes.checkpathhop));

console.log("returning true...");

	return true;

  }
};

