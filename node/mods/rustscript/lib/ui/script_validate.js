/** UI-only structural validation for expert-mode JSON editing. */

function validateScriptStructure(ast) {
  const errors = [];

  if (ast === null || ast === undefined) {
    return { valid: false, errors: [{ path: 'root', message: 'Script is missing' }] };
  }

  function walk(node, path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push({ path, message: 'Expected script object' });
      return;
    }

    if (typeof node.op !== 'string' || node.op.length === 0) {
      errors.push({ path, message: 'Missing or empty "op" field' });
      return;
    }

    const op = node.op.toLowerCase();

    if (op === 'and' || op === 'or' || op === 'not' || op === 'then') {
      if (!Array.isArray(node.args)) {
        errors.push({ path, message: `"${node.op}" requires "args" array` });
        return;
      }
      if (op === 'not' && node.args.length !== 1) {
        errors.push({ path, message: 'NOT requires exactly one argument' });
      }
      if ((op === 'and' || op === 'or') && node.args.length < 2) {
        errors.push({ path, message: `"${node.op}" requires at least two arguments` });
      }
      if (op === 'then' && node.args.length < 2) {
        errors.push({ path, message: 'THEN requires at least two phase arguments' });
      }
      for (let i = 0; i < node.args.length; i++) {
        walk(node.args[i], `${path}.args[${i}]`);
      }
      return;
    }

    if (node.args !== undefined) {
      errors.push({ path, message: 'Leaf opcode must not have "args"' });
    }

    if (node.witness !== undefined) {
      errors.push({ path, message: 'Legacy "witness" field is not supported — use "required"' });
    }

    if (node.required != null && (typeof node.required !== 'object' || Array.isArray(node.required))) {
      errors.push({ path, message: '"required" must be a plain object when present' });
    }
  }

  walk(ast, 'root');
  return { valid: errors.length === 0, errors };
}

module.exports = { validateScriptStructure };
