/**
 * Purpose: SETFIELD opcode — copy a value into a writable context location.
 *
 * Language shape:
 *   script.reference  — destination path (must be context.*)
 *   script.value      — literal or resolve_ref source
 *
 * Read-only destinations (script.*, witness.*, tx.*, blk.*) are rejected.
 */

module.exports = {
  name: 'SETFIELD',
  description: `
Copies a value into a writable location in the execution context.

reference is the destination path. value is a literal or a normal RustScript
reference resolved like every other opcode operand.

Only context.* destinations are writable.
`,
  exampleScript: {
    op: 'SETFIELD',
    reference: 'context.constitution.owner',
    value: '__opcodes.importfield.owner'
  },
  schema: {
    reference: 'string',
    value: 'reference'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const reference = node.reference;
    if (typeof reference !== 'string' || reference.length === 0) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(node, 'value')) {
      return false;
    }

    if (!reference.startsWith('context.')) {
      return false;
    }

    const path = reference.slice('context.'.length);
    if (!path || isForbiddenWritePath(path)) {
      return false;
    }

    const value = resolveRef(context, node.value);
    return setContextPath(context, path, value);
  }
};

function isForbiddenWritePath(path) {
  return (
    path === 'script' ||
    path.startsWith('script.') ||
    path === 'witness' ||
    path.startsWith('witness.') ||
    path === 'tx' ||
    path.startsWith('tx.') ||
    path === 'blk' ||
    path.startsWith('blk.')
  );
}

function pathSegments(path) {
  return String(path)
    .replace(/\[/g, '.')
    .replace(/\]/g, '')
    .split('.')
    .filter((s) => s.length > 0);
}

function setContextPath(root, path, value) {
  const segments = pathSegments(path);
  if (!segments.length) {
    return false;
  }

  let current = root;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;
    const asIndex = /^[0-9]+$/.test(segment) ? Number(segment) : null;

    if (isLast) {
      if (asIndex !== null) {
        if (!Array.isArray(current) || asIndex >= current.length) {
          return false;
        }
        current[asIndex] = value;
        return true;
      }
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return false;
      }
      current[segment] = value;
      return true;
    }

    if (asIndex !== null) {
      if (!Array.isArray(current) || asIndex >= current.length) {
        return false;
      }
      current = current[asIndex];
      continue;
    }

    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      current[segment] = {};
    }
    current = current[segment];
  }

  return false;
}

function resolveRef(root, ref) {
  if (typeof ref !== 'string') {
    return ref;
  }
  const parts = ref.split('.');
  let cursor = root;
  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    if (
      !cursor ||
      typeof cursor !== 'object' ||
      !Object.prototype.hasOwnProperty.call(cursor, key)
    ) {
      return ref;
    }
    cursor = cursor[key];
  }
  return cursor;
}
