/**
 * Token stream → canonical AST.
 *
 * Grammar precedence (lowest → highest): THEN (sequencing), OR, AND, NOT.
 * THEN is ordered execution, not a boolean combinator.
 * Leaf form: OPCODE or OPCODE[field=value, required.field=value]
 */

// Lowest precedence — THEN sequences phases (ordered execution, not boolean logic).
const PREC_THEN = 1;
const PREC_OR = 2;
const PREC_AND = 3;
// Highest precedence — unary NOT binds tightest.
const PREC_NOT = 4;

function parse(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error('Token stream is empty');
  }

  let pos = 0;

  function peek(offset = 0) {
    return tokens[pos + offset];
  }

  function peekType(offset = 0) {
    return tokens[pos + offset]?.type;
  }

  function advance() {
    return tokens[pos++];
  }

  function syntaxError(expected) {
    const tok = peek();
    const got = tok ? tok.type : 'EOF';
    throw new Error(`Expected ${expected} but found ${got} at ${tok?.line}:${tok?.column}`);
  }

  function expect(type) {
    const tok = peek();
    if (!tok || tok.type !== type) {
      syntaxError(type);
    }
    return advance();
  }

  function parse_expr(min_prec) {
    let node;

    // --- parse unary NOT ---
    if (peekType() === 'NOT') {
      advance();
      node = { op: 'NOT', args: [parse_expr(PREC_NOT)] };

    // --- parse grouped expression ( ... ) ---
    } else if (peekType() === 'LPAREN') {
      advance();
      node = parse_expr(0);
      if (peekType() !== 'RPAREN') {
        syntaxError('RPAREN');
      }
      advance();

    // --- parse opcode invocation ---
    } else if (peekType() === 'IDENT') {
      const nameTok = advance();
      node = { op: String(nameTok.value).toUpperCase() };

      // Optional [ key=value, required.field=value, ... ]
      if (peekType() === 'LBRACKET') {
        advance();

        if (peekType() !== 'RBRACKET') {
          do {
            const keyTok = expect('IDENT');
            const key = keyTok.value.toLowerCase();
            expect('EQUALS');

            const valTok = peek();
            if (!valTok || (valTok.type !== 'STRING' && valTok.type !== 'IDENT')) {
              syntaxError('STRING or IDENT');
            }
            const value = advance().value;

            if (key.startsWith('required.')) {
              const field = key.slice('required.'.length);
              if (!node.required) {
                node.required = {};
              }
              if (valTok.type === 'IDENT' && String(value).toLowerCase() === 'true') {
                node.required[field] = true;
              } else {
                node.required[field] = value;
              }
            } else {
              node[key] = value;
            }
          } while (peekType() === 'COMMA' && advance());
        }

        expect('RBRACKET');
      }
    } else {
      syntaxError('expression');
    }

    // --- parse binary operators by precedence ---
    while (true) {
      if (peekType() === 'THEN' && min_prec <= PREC_THEN) {
        advance();
        const phases = [node];
        do {
          phases.push(parse_expr(PREC_THEN + 1));
        } while (peekType() === 'THEN' && advance());
        node = { op: 'THEN', args: phases };
        continue;
      }

      if (peekType() === 'OR' && min_prec <= PREC_OR) {
        advance();
        node = { op: 'OR', args: [node, parse_expr(PREC_OR + 1)] };
        continue;
      }

      if (peekType() === 'AND' && min_prec <= PREC_AND) {
        advance();
        node = { op: 'AND', args: [node, parse_expr(PREC_AND + 1)] };
        continue;
      }

      break;
    }

    return node;
  }

  const ast = parse_expr(0);
  if (peekType() !== 'EOF') {
    syntaxError('EOF');
  }
  return ast;
}

module.exports = parse;
