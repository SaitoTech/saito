module.exports = {

  name: "CHECKFIELD",

  description: `
Compares two values (resolved via VARS or literals) using a comparison operator.
Returns true if the comparison holds.
`,

  exampleScript: {
    op: "CHECKFIELD",
    field: "__opcodes.sumfields.expiry",
    operator: ">",
    value: "NOW"
  },

  execute(node, context) {
    const left  = context.app.browser.resolveVarReference(context, node.field);
    const right = context.app.browser.resolveVarReference(context, node.value);

    if (left === undefined || right === undefined) {
      return false;
    }

    const lnum = Number(left);
    const rnum = Number(right);

    const l = Number.isFinite(lnum) ? lnum : left;
    const r = Number.isFinite(rnum) ? rnum : right;

    const op = node.operator;

    switch (op) {

      case "==":
      case "equals":
        return l === r;

      case "!=":
      case "notequals":
        return l !== r;

      case "<":
      case "lessthan":
        return l < r;

      case "<=":
      case "lessthanorequal":
        return l <= r;

      case ">":
      case "greaterthan":
        return l > r;

      case ">=":
      case "greaterthanorequal":
        return l >= r;

      default:
        return false;
    }
  }
};
