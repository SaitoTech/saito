function validationError(message, line = null, column = null) {
  return { valid: false, message, line, column };
}

function validateJavaScript(source, acorn) {
  if (!acorn?.parse) {
    return validationError('JavaScript parser failed to load');
  }
  try {
    acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowHashBang: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true
    });
    return { valid: true, message: 'Valid JavaScript' };
  } catch (err) {
    return validationError(err.message, err.loc?.line ?? null, (err.loc?.column ?? -1) + 1);
  }
}

function validateCssBalance(source) {
  const pairs = { '{': '}', '[': ']', '(': ')' };
  const openers = new Set(Object.keys(pairs));
  const closers = new Set(Object.values(pairs));
  const stack = [];
  let quote = '';
  let escaped = false;
  let inComment = false;
  let line = 1;
  let column = 0;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    column += 1;

    if (char === '\n') {
      line += 1;
      column = 0;
    }
    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        i += 1;
        column += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '/' && next === '*') {
      inComment = true;
      i += 1;
      column += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (openers.has(char)) {
      stack.push({ char, line, column });
      continue;
    }
    if (closers.has(char)) {
      const opener = stack.pop();
      if (!opener || pairs[opener.char] !== char) {
        return validationError(`Unexpected "${char}"`, line, column);
      }
    }
  }

  if (inComment) {
    return validationError('Unclosed comment', line, column);
  }
  if (quote) {
    return validationError('Unclosed string', line, column);
  }
  if (stack.length) {
    const opener = stack.at(-1);
    return validationError(`Unclosed "${opener.char}"`, opener.line, opener.column);
  }
  return null;
}

function validateCss(source, csstree) {
  if (!csstree?.parse || !csstree?.walk || !csstree?.generate) {
    return validationError('CSS parser failed to load');
  }
  const balanceError = validateCssBalance(source);
  if (balanceError) {
    return balanceError;
  }

  const errors = [];
  try {
    const ast = csstree.parse(source, {
      positions: true,
      onParseError: (err) => errors.push(err)
    });
    if (errors.length) {
      const err = errors[0];
      return validationError(
        err.message,
        err.loc?.start?.line ?? err.line ?? null,
        err.loc?.start?.column ?? err.column ?? null
      );
    }

    let emptyDeclaration = null;
    csstree.walk(ast, (node) => {
      if (
        !emptyDeclaration &&
        node.type === 'Declaration' &&
        csstree.generate(node.value).trim() === ''
      ) {
        emptyDeclaration = node;
      }
    });
    if (emptyDeclaration) {
      return validationError(
        `Missing value for "${emptyDeclaration.property}"`,
        emptyDeclaration.loc?.start?.line ?? null,
        emptyDeclaration.loc?.start?.column ?? null
      );
    }
    return { valid: true, message: 'Valid CSS' };
  } catch (err) {
    return validationError(
      err.message,
      err.loc?.start?.line ?? err.line ?? null,
      err.loc?.start?.column ?? err.column ?? null
    );
  }
}

function validateSource(type, source, parsers = globalThis) {
  if (typeof source !== 'string' || source.trim() === '') {
    return validationError('Source is empty', 1, 1);
  }
  return type === 'css'
    ? validateCss(source, parsers.csstree)
    : validateJavaScript(source, parsers.acorn);
}

module.exports = { validateSource };
