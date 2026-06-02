/**
 * Purpose: Parse canonical tokens into a RustScript AST.
 */

function tokens_to_ast(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return false;
  }

  const output = [];
  const operators = [];
  const precedence = { THEN: 1, OR: 2, AND: 3, NOT: 4 };
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || typeof token !== 'object' || typeof token.type !== 'string') {
      return false;
    }

    if (token.type === 'LPAREN') {
      operators.push('(');
      i += 1;
      continue;
    }

    if (token.type === 'RPAREN') {
      while (operators.length > 0 && operators[operators.length - 1] !== '(') {
        output.push(operators.pop());
      }
      if (operators.length === 0 || operators[operators.length - 1] !== '(') {
        return false;
      }
      operators.pop();
      i += 1;
      continue;
    }

    if (token.type === 'IDENT') {
      const name = String(token.value || '');
      const upper = name.toUpperCase();

      if (upper === 'AND' || upper === 'OR' || upper === 'NOT' || upper === 'THEN') {
        while (operators.length > 0) {
          const top = operators[operators.length - 1];
          if (top === '(') {
            break;
          }
          const topPrec = precedence[top] || 0;
          const curPrec = precedence[upper] || 0;
          const rightAssoc = upper === 'NOT';
          if ((rightAssoc && topPrec > curPrec) || (!rightAssoc && topPrec >= curPrec)) {
            output.push(operators.pop());
          } else {
            break;
          }
        }
        operators.push(upper);
        i += 1;
        continue;
      }

      const node = { op: name };
      i += 1;

      if (i < tokens.length && tokens[i] && tokens[i].type === 'LBRACKET') {
        i += 1;
        let expectField = true;

        while (i < tokens.length) {
          const t = tokens[i];
          if (!t || typeof t.type !== 'string') {
            return false;
          }

          if (t.type === 'RBRACKET') {
            i += 1;
            expectField = false;
            break;
          }

          if (!expectField) {
            return false;
          }

          if (t.type !== 'IDENT') {
            return false;
          }
          const key = String(t.value || '');
          if (!key) {
            return false;
          }
          i += 1;

          if (i >= tokens.length || !tokens[i] || tokens[i].type !== 'EQUALS') {
            return false;
          }
          i += 1;

          if (i >= tokens.length || !tokens[i]) {
            return false;
          }
          const v = tokens[i];
          if (v.type === 'STRING' || v.type === 'NUMBER' || v.type === 'BOOLEAN') {
            node[key] = v.value;
          } else if (v.type === 'IDENT') {
            node[key] = String(v.value || '');
          } else {
            return false;
          }
          i += 1;

          if (i < tokens.length && tokens[i] && tokens[i].type === 'COMMA') {
            i += 1;
            expectField = true;
          } else {
            expectField = false;
          }
        }

        if (expectField) {
          return false;
        }
      }

      output.push(node);
      continue;
    }

    return false;
  }

  while (operators.length > 0) {
    const op = operators.pop();
    if (op === '(') {
      return false;
    }
    output.push(op);
  }

  if (output.length === 0) {
    return false;
  }

  const stack = [];
  for (let j = 0; j < output.length; j += 1) {
    const item = output[j];

    if (typeof item === 'string') {
      if (item === 'NOT') {
        if (stack.length < 1) {
          return false;
        }
        const a = stack.pop();
        stack.push({ op: 'NOT', args: [a] });
        continue;
      }

      if (item === 'AND' || item === 'OR' || item === 'THEN') {
        if (stack.length < 2) {
          return false;
        }
        const right = stack.pop();
        const left = stack.pop();
        stack.push({ op: item, args: [left, right] });
        continue;
      }

      return false;
    }

    if (!item || typeof item !== 'object' || typeof item.op !== 'string' || item.op.length === 0) {
      return false;
    }
    stack.push(item);
  }

  if (stack.length !== 1) {
    return false;
  }

  return stack[0];
}

module.exports = tokens_to_ast;
