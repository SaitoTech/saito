/**
 * Public parse API: source text → { ast, tokens, json, asciiTree }.
 */

const { tokenize } = require('./tokenizer');
const { parse } = require('./parser');
const { astToJson, astToAsciiTree } = require('./render');

function parseExpertScript(source) {
  const text = String(source ?? '').trim();
  if (!text) {
    throw new Error('Script is empty');
  }

  const tokens = tokenize(text);
  const ast = parse(tokens);

  return {
    ast,
    tokens: tokens.map((t) => ({
      type: t.type,
      value: t.value,
      line: t.line,
      column: t.column
    })),
    json: astToJson(ast),
    asciiTree: astToAsciiTree(ast).trimEnd()
  };
}

module.exports = {
  parseExpertScript,
  tokenize,
  parse,
  astToJson,
  astToAsciiTree
};
