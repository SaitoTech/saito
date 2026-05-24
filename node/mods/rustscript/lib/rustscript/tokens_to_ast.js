/**
 * token stream → locking script AST
 * @param {Array<{ type: string, value?: string }>} tokens
 * @returns {object}
 */
function tokens_to_ast(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error('Token stream is empty');
  }

  let pos = 0;

  const PREC_THEN = 1;
  const PREC_OR = 2;
  const PREC_AND = 3;
  const PREC_NOT = 4;

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

  function parse(min_prec) {
    let node;

    if (peekType() === 'NOT') {
      advance();
      node = { op: 'NOT', args: [parse(PREC_NOT)] };
    } else if (peekType() === 'LPAREN') {
      advance();
      node = parse(0);
      if (peekType() !== 'RPAREN') {
        syntaxError('RPAREN');
      }
      advance();
    } else if (peekType() === 'IDENT') {
      const nameTok = advance();
      const name = nameTok.value;

      if (peekType() === 'LBRACKET') {
        advance();
        const bindings = {};
        const witnessDecl = {};

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

            if (key.startsWith('witness.')) {
              const field = key.slice('witness.'.length);
              witnessDecl[field] = {
                value,
                literal: valTok.type === 'STRING'
              };
            } else if (peekType() === 'AS') {
              advance();
              const aliasTok = expect('IDENT');
              bindings[key] = value;
              bindings.as = aliasTok.value.toLowerCase();
            } else {
              bindings[key] = value;
            }
          } while (peekType() === 'COMMA' && advance());
        }

        expect('RBRACKET');
        node = { op: String(name).toUpperCase(), bindings, witnessDecl };
      } else {
        node = { op: String(name).toUpperCase() };
      }
    } else {
      syntaxError('expression');
    }

    while (true) {
      if (peekType() === 'THEN' && min_prec <= PREC_THEN) {
        advance();
        const phases = [node];
        do {
          phases.push(parse(PREC_THEN + 1));
        } while (peekType() === 'THEN' && advance());
        node = { op: 'THEN', args: phases };
        continue;
      }

      if (peekType() === 'OR' && min_prec <= PREC_OR) {
        advance();
        node = { op: 'OR', args: [node, parse(PREC_OR + 1)] };
        continue;
      }

      if (peekType() === 'AND' && min_prec <= PREC_AND) {
        advance();
        node = { op: 'AND', args: [node, parse(PREC_AND + 1)] };
        continue;
      }

      break;
    }

    return node;
  }

  const ast = parse(0);
  if (peekType() !== 'EOF') {
    syntaxError('EOF');
  }
  return ast;
}

module.exports = tokens_to_ast;
