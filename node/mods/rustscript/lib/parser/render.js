/**
 * AST debug renderers: JSON and ASCII tree.
 */

function astToJson(ast) {
  return JSON.stringify(ast, null, 2);
}

function astToAsciiTree(ast, indent = 0) {
  const pad = '  '.repeat(indent);
  if (!ast || typeof ast !== 'object') {
    return `${pad}${String(ast)}\n`;
  }

  const op = ast.op ?? '?';
  let out = `${pad}${op}\n`;

  const metaKeys = new Set(['op', 'args']);
  for (const key of Object.keys(ast)) {
    if (metaKeys.has(key)) {
      continue;
    }
    const val = ast[key];
    if (Array.isArray(val)) {
      out += `${pad}  ${key}:\n`;
      for (const item of val) {
        out += astToAsciiTree(item, indent + 2);
      }
    } else if (val && typeof val === 'object') {
      out += `${pad}  ${key}:\n${astToAsciiTree(val, indent + 2)}`;
    } else {
      out += `${pad}  ${key}: ${JSON.stringify(val)}\n`;
    }
  }

  if (Array.isArray(ast.args)) {
    out += `${pad}  args:\n`;
    for (let i = 0; i < ast.args.length; i++) {
      out += `${pad}    [${i}]:\n${astToAsciiTree(ast.args[i], indent + 3)}`;
    }
  }

  return out;
}

module.exports = {
  astToJson,
  astToAsciiTree
};
