/**
 * Recursive-descent parser for symbolic scripts.
 */

const { TokenType } = require('./tokenizer');
const { logicalOp, thenOp, notOp, symbolOp, opcodeNode } = require('./ast');

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  parse() {
    const ast = this.parseExpr();
    this.expect(TokenType.EOF);
    return ast;
  }

  peek() {
    return this.tokens[this.pos];
  }

  peekType(offset = 0) {
    return this.tokens[this.pos + offset]?.type;
  }

  advance() {
    return this.tokens[this.pos++];
  }

  expect(type) {
    const tok = this.peek();
    if (!tok || tok.type !== type) {
      const got = tok ? tok.type : 'EOF';
      throw new Error(`Expected ${type} but found ${got} at ${tok?.line}:${tok?.column}`);
    }
    return this.advance();
  }

  match(type) {
    if (this.peekType() === type) {
      this.advance();
      return true;
    }
    return false;
  }

  /**
   * Top-level: ordered phases separated by THEN.
   */
  parseExpr() {
    return this.parseThenChain();
  }

  parseThenChain() {
    let left = this.parseAndOr();
    const phases = [left];

    while (this.match(TokenType.THEN)) {
      phases.push(this.parseAndOr());
    }

    if (phases.length === 1) {
      return phases[0];
    }
    return thenOp(phases);
  }

  parseAndOr() {
    let left = this.parseUnary();

    while (true) {
      if (this.match(TokenType.AND)) {
        const right = this.parseUnary();
        left = logicalOp('and', [left, right]);
      } else if (this.match(TokenType.OR)) {
        const right = this.parseUnary();
        left = logicalOp('or', [left, right]);
      } else {
        break;
      }
    }

    return left;
  }

  parseUnary() {
    if (this.match(TokenType.NOT)) {
      return notOp(this.parseUnary());
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.match(TokenType.LPAREN)) {
      const inner = this.parseExpr();
      this.expect(TokenType.RPAREN);
      return inner;
    }

    const nameTok = this.expect(TokenType.IDENT);
    const name = nameTok.value;

    if (this.peekType() === TokenType.LBRACKET) {
      return this.parseOpcode(name);
    }

    return symbolOp(name);
  }

  parseOpcode(name) {
    this.expect(TokenType.LBRACKET);
    const params = {};

    if (this.peekType() !== TokenType.RBRACKET) {
      do {
        const keyTok = this.expect(TokenType.IDENT);
        const key = keyTok.value.toLowerCase();
        this.expect(TokenType.EQUALS);
        const value = this.parseValue();

        if (this.match(TokenType.AS)) {
          const aliasTok = this.expect(TokenType.IDENT);
          params[key] = value;
          params.as = aliasTok.value.toLowerCase();
        } else {
          params[key] = value;
        }
      } while (this.match(TokenType.COMMA));
    }

    this.expect(TokenType.RBRACKET);
    return opcodeNode(name, params);
  }

  parseValue() {
    const tok = this.peek();
    if (!tok) {
      throw new Error('Unexpected end of input while parsing value');
    }
    if (tok.type === TokenType.STRING) {
      this.advance();
      return tok.value;
    }
    if (tok.type === TokenType.IDENT) {
      this.advance();
      return tok.value;
    }
    throw new Error(`Invalid value at ${tok.line}:${tok.column}`);
  }
}

function parse(tokens) {
  return new Parser(tokens).parse();
}

module.exports = { Parser, parse };
