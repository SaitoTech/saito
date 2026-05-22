/**
 * semantic script text → token stream
 * @param {string} input
 * @returns {Array<{ type: string, value?: string, line?: number, column?: number }>}
 */
function semantic_to_tokens(input) {
  const text = String(input ?? '');
  const tokens = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'THEN', 'AS']);

  function peek(n = 0) {
    return text[i + n];
  }

  function advance() {
    const ch = text[i++];
    if (ch === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  }

  while (i < text.length) {
    const ch = peek();
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      advance();
      continue;
    }

    const startLine = line;
    const startCol = column;

    if (ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '=' || ch === ',') {
      advance();
      const type =
        ch === '(' ? 'LPAREN' :
        ch === ')' ? 'RPAREN' :
        ch === '[' ? 'LBRACKET' :
        ch === ']' ? 'RBRACKET' :
        ch === '=' ? 'EQUALS' : 'COMMA';
      tokens.push({ type, value: ch, line: startLine, column: startCol });
      continue;
    }

    if (ch === '"') {
      advance();
      let value = '';
      while (i < text.length && peek() !== '"') {
        if (peek() === '\\' && peek(1) !== undefined) {
          advance();
          value += advance();
        } else {
          value += advance();
        }
      }
      if (peek() !== '"') {
        throw new Error(`Unterminated string at ${startLine}:${startCol}`);
      }
      advance();
      tokens.push({ type: 'STRING', value, line: startLine, column: startCol });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let value = '';
      while (i < text.length && (/[A-Za-z0-9_]/.test(peek()) || peek() === '.')) {
        value += advance();
      }
      const upper = value.toUpperCase();
      if (KEYWORDS.has(upper) && !value.includes('.')) {
        tokens.push({ type: upper, value: upper, line: startLine, column: startCol });
      } else {
        tokens.push({ type: 'IDENT', value, line: startLine, column: startCol });
      }
      continue;
    }

    throw new Error(`Unexpected character "${ch}" at ${line}:${column}`);
  }

  tokens.push({ type: 'EOF', value: '', line, column });
  return tokens;
}

module.exports = semantic_to_tokens;
