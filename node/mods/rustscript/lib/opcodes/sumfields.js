module.exports = {

  name: "SUMFIELDS",

  description: `
Adds two numeric fields (resolved via VARS or literals) and stores the result
inside context.__opcodes.sumfields under a controlled key.
`,

  exampleScript: {
    op: "SUMFIELDS",
    a: "__opcodes.checkpathhop.activation_time",
    b: "__opcodes.importfield.duration",
    into: "expiry"
  },

  execute(app, script, witness, context) {

    try {

      // ---------------------------------------------
      // Resolve operands
      // ---------------------------------------------
      const left  = app.browser.resolveVarReference(context, script.a);
      const right = app.browser.resolveVarReference(context, script.b);

      if (left === undefined || right === undefined) {
        return false;
      }

      const l = Number(left);
      const r = Number(right);

      if (!Number.isFinite(l) || !Number.isFinite(r)) {
        return false;
      }

      const sum = l + r;

      // ---------------------------------------------
      // Validate destination key (NOT a path)
      // ---------------------------------------------
      const key = script.into;

      if (
        typeof key !== "string" ||
        !/^[a-zA-Z0-9_]+$/.test(key)
      ) {
        return false;
      }

      // ---------------------------------------------
      // Write into controlled namespace only
      // ---------------------------------------------
      if (!context.__opcodes) { context.__opcodes = {}; }
      if (!context.__opcodes.sumfields) { context.__opcodes.sumfields = {}; }

      context.__opcodes.sumfields[key] = sum;

      return true;

    } catch (err) {
      return false;
    }
  }
};

