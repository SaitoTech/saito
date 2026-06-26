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

  execute(node, context) {
    const left  = context.app.browser.resolveVarReference(context, node.a);
    const right = context.app.browser.resolveVarReference(context, node.b);

    if (left === undefined || right === undefined) {
      return false;
    }

    const l = Number(left);
    const r = Number(right);

    if (!Number.isFinite(l) || !Number.isFinite(r)) {
      return false;
    }

    const sum = l + r;

    const key = node.into;

    if (
      typeof key !== "string" ||
      !/^[a-zA-Z0-9_]+$/.test(key)
    ) {
      return false;
    }

    if (!context.__opcodes) { context.__opcodes = {}; }
    if (!context.__opcodes.sumfields) { context.__opcodes.sumfields = {}; }

    context.__opcodes.sumfields[key] = sum;

    return true;
  }
};
