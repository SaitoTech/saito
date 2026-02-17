
module.exports = {

  name: "CHECKSENDER",
  description: "Check transaction sender matches supplied publickey.",

  exampleScript: {
    op: "CHECKSENDER",
    publickey: "<publickey>"
  },

  exampleWitness: {},

  schema: {
    script: {
      publickey: "string"
    },
    witness: {}
  },

  execute: function (app, script, witness, vars, tx, blk) {
    try {
      // canonical places we might find the sender in the execution context
      const sender =
        (vars && vars.tx && vars.tx.sender) ||
        (vars && vars["tx.sender"]) ||
        (vars && vars.sender) ||
        null;

      const required = script.publickey || null;
      if (!required) return false; // script must state the required key

      // normalize case to avoid superficial mismatches
      if (!sender) return false;
      return String(sender).toLowerCase() === String(required).toLowerCase();
    } catch (err) {
      console.error("CHECKSENDER execute error:", err);
      return false;
    }
  }
};


