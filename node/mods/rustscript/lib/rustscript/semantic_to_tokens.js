/**
 * Purpose: Convert semantic RustScript text into canonical tokens.
 *
 * Lexical rules:
 * - Integers only (optional leading minus). No floating point.
 * - Double-quoted strings only. Backslash escapes the next character.
 * - Identifiers are dot-separated paths: segment(.segment)*
 *   Each segment starts with [A-Za-z_$] and continues with [A-Za-z0-9_$].
 * - TRUE / FALSE (case-insensitive) when the token is a single segment.
 */

function semantic_to_tokens(input) {
  if (typeof input !== 'string') {
    return false;
  }

  const tokens = [];
  let i = 0;
  const n = input.length;

  const isAlpha = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
  const isDigit = (c) => c >= '0' && c <= '9';
  const isIdentStart = (c) => isAlpha(c) || c === '_' || c === '$';
  const isIdentPart = (c) => isIdentStart(c) || isDigit(c);
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

  const PUNCT = {
    '(': 'LPAREN',
    ')': 'RPAREN',
    '[': 'LBRACKET',
    ']': 'RBRACKET',
    ',': 'COMMA',
    '=': 'EQUALS'
  };

  while (i < n) {
    const ch = input[i];

    if (isSpace(ch)) {
      i += 1;
      continue;
    }

    const punctType = PUNCT[ch];
    if (punctType) {
      tokens.push({ type: punctType, value: ch });
      i += 1;
      continue;
    }

    if (ch === '"') {
      i += 1;
      let value = '';
      let closed = false;

      while (i < n) {
        const c = input[i];
        if (c === '\\') {
          if (i + 1 >= n) {
            return false;
          }
          value += input[i + 1];
          i += 2;
          continue;
        }
        if (c === '"') {
          closed = true;
          i += 1;
          break;
        }
        value += c;
        i += 1;
      }

      if (!closed) {
        return false;
      }

      tokens.push({ type: 'STRING', value });
      continue;
    }

    if (isDigit(ch) || (ch === '-' && i + 1 < n && isDigit(input[i + 1]))) {
      const start = i;
      if (input[i] === '-') {
        i += 1;
      }
      while (i < n && isDigit(input[i])) {
        i += 1;
      }
      const num = Number(input.slice(start, i));
      if (!Number.isInteger(num)) {
        return false;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      i += 1;
      while (i < n && isIdentPart(input[i])) {
        i += 1;
      }

      while (i < n && input[i] === '.') {
        i += 1;
        if (i >= n || !isIdentStart(input[i])) {
          return false;
        }
        while (i < n && isIdentPart(input[i])) {
          i += 1;
        }
      }

      const raw = input.slice(start, i);
      if (raw.indexOf('.') === -1) {
        const upper = raw.toUpperCase();
        if (upper === 'TRUE') {
          tokens.push({ type: 'BOOLEAN', value: true });
          continue;
        }
        if (upper === 'FALSE') {
          tokens.push({ type: 'BOOLEAN', value: false });
          continue;
        }
      }

      tokens.push({ type: 'IDENT', value: raw });
      continue;
    }

    return false;
  }

  return tokens;
}

module.exports = semantic_to_tokens;
