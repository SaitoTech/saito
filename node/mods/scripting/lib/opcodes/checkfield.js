
module.exports = {
  name: "CHECKFIELD",
  description: "Check a field inside the current transaction or loaded proof transaction.",

  exampleScript: {
    op: "CHECKFIELD",
    field: "<tx.msg.module>",
    equals: "Registry"
  },

  exampleWitness: {},

  schema: {
    script: {
      field: "string",      // e.g. "msg.username"
      equals: "string?",    // optional
      notequals: "string?",
      greaterthan: "string?",
      lessthan: "string?",
      in: "array?",         // e.g. ["modA", "modB"]
      exists: "boolean?"    // must exist (true) or must NOT exist (false)
    },
    witness: {}
  },

  execute: function (app, script, witness, vars, tx, blk) {

    //
    // 1. Choose the active transaction context
    //
    const active_tx = vars._loaded_proof_tx || tx;

    //
    // 2. Navigate field path (e.g. "msg.username", "from[0].publickey")
    //
    const path = script.field;
    if (!path || typeof path !== "string") { return false; }

    let value = active_tx;

    try {
      const parts = path.split(".");
      for (let part of parts) {

        const arrayMatch = part.match(/(.*)\[(\d+)\]/); // e.g. "from[0]"

        if (arrayMatch) {
          const key = arrayMatch[1];
          const idx = parseInt(arrayMatch[2]);

          if (!value[key] || !Array.isArray(value[key])) return false;
          value = value[key][idx];
        } else {
          if (!value.hasOwnProperty(part)) return false;
          value = value[part];
        }
      }
    } catch (err) {
      return false;
    }

    //
    // 3. If checking only existence:
    //
    if (typeof script.exists === "boolean") {
      return script.exists ? value !== undefined : value === undefined;
    }

    //
    // 4. Apply comparisons
    //
    if (script.equals !== undefined) {
      return value == script.equals;
    }

    if (script.notequals !== undefined) {
      return value != script.notequals;
    }

    if (script.greaterthan !== undefined) {
      return parseFloat(value) > parseFloat(script.greaterthan);
    }

    if (script.lessthan !== undefined) {
      return parseFloat(value) < parseFloat(script.lessthan);
    }

    if (Array.isArray(script.in)) {
      return script.in.includes(value);
    }

    //
    // 5. If no operator was specified → invalid usage
    //
    return false;
  }
};


