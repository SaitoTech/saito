/**
 * Purpose: Convert semantic RustScript text into canonical tokens.
 */

function semantic_to_tokens(input) {
  if (typeof input !== 'string') {
    return false;
  }

  const tokens = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i += 1;
      continue;
    }
    if (ch === '[') {
      tokens.push({ type: 'LBRACKET', value: '[' });
      i += 1;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'RBRACKET', value: ']' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      i += 1;
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'EQUALS', value: '=' });
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
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
        if (c === quote) {
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

      tokens.push({ type: 'STRING', value: value });
      continue;
    }

    if (
      (ch >= '0' && ch <= '9') ||
      (ch === '-' && i + 1 < n && input[i + 1] >= '0' && input[i + 1] <= '9')
    ) {
      let start = i;
      i += 1;
      while (i < n && input[i] >= '0' && input[i] <= '9') {
        i += 1;
      }
      if (i < n && input[i] === '.') {
        i += 1;
        if (i >= n || input[i] < '0' || input[i] > '9') {
          return false;
        }
        while (i < n && input[i] >= '0' && input[i] <= '9') {
          i += 1;
        }
      }
      const num = Number(input.slice(start, i));
      if (!Number.isFinite(num)) {
        return false;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    const isIdentStart =
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      ch === '_' ||
      ch === '$';

    if (isIdentStart) {
      let start = i;
      i += 1;
      while (i < n) {
        const c = input[i];
        const isIdentChar =
          (c >= 'A' && c <= 'Z') ||
          (c >= 'a' && c <= 'z') ||
          (c >= '0' && c <= '9') ||
          c === '_' ||
          c === '$' ||
          c === '.';
        if (!isIdentChar) {
          break;
        }
        i += 1;
      }

      const raw = input.slice(start, i);
      const upper = raw.toUpperCase();
      if (upper === 'TRUE') {
        tokens.push({ type: 'BOOLEAN', value: true });
      } else if (upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: false });
      } else {
        tokens.push({ type: 'IDENT', value: raw });
      }
      continue;
    }

    return false;
  }

  return tokens;
}

module.exports = semantic_to_tokens;
