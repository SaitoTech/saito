/**
 * Tokenizer for the rustscript symbolic language.
 */

const TokenType = {
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  EQUALS: 'EQUALS',
  COMMA: 'COMMA',
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  THEN: 'THEN',
  AS: 'AS',
  STRING: 'STRING',
  IDENT: 'IDENT',
  EOF: 'EOF'
};

const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'THEN', 'AS']);

class Token {
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }
}

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isIdentStart(ch) {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch) {
  return /[A-Za-z0-9_]/.test(ch);
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const peek = (n = 0) => source[i + n];
  const advance = () => {
    const ch = source[i++];
    if (ch === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  };

  while (i < source.length) {
    const ch = peek();
    if (ch === undefined) {
      break;
    }

    if (isWhitespace(ch)) {
      advance();
      continue;
    }

    const startLine = line;
    const startCol = column;

    if (ch === '(') {
      advance();
      tokens.push(new Token(TokenType.LPAREN, '(', startLine, startCol));
      continue;
    }
    if (ch === ')') {
      advance();
      tokens.push(new Token(TokenType.RPAREN, ')', startLine, startCol));
      continue;
    }
    if (ch === '[') {
      advance();
      tokens.push(new Token(TokenType.LBRACKET, '[', startLine, startCol));
      continue;
    }
    if (ch === ']') {
      advance();
      tokens.push(new Token(TokenType.RBRACKET, ']', startLine, startCol));
      continue;
    }
    if (ch === '=') {
      advance();
      tokens.push(new Token(TokenType.EQUALS, '=', startLine, startCol));
      continue;
    }
    if (ch === ',') {
      advance();
      tokens.push(new Token(TokenType.COMMA, ',', startLine, startCol));
      continue;
    }

    if (ch === '"') {
      advance();
      let value = '';
      while (i < source.length && peek() !== '"') {
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
      tokens.push(new Token(TokenType.STRING, value, startLine, startCol));
      continue;
    }

    if (isIdentStart(ch)) {
      let value = '';
      while (i < source.length && (isIdentPart(peek()) || peek() === '.')) {
        value += advance();
      }
      const upper = value.toUpperCase();
      if (KEYWORDS.has(upper) && !value.includes('.')) {
        tokens.push(new Token(TokenType[upper], upper, startLine, startCol));
      } else {
        tokens.push(new Token(TokenType.IDENT, value, startLine, startCol));
      }
      continue;
    }

    throw new Error(`Unexpected character "${ch}" at ${line}:${column}`);
  }

  tokens.push(new Token(TokenType.EOF, '', line, column));
  return tokens;
}

module.exports = {
  TokenType,
  Token,
  tokenize
};
