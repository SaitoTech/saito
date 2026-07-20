/**
 * Purpose: ARRAYIFY opcode — replace a context value with deep clones of itself.
 *
 * Language shape:
 *   script.reference  — context.* path to clone in place
 *   script.dimension  — copy count (literal, resolve_ref, or tx.to/from.p2sh)
 *
 * Read-only destinations (script.*, witness.*, tx.*, blk.*) are rejected.
 */

module.exports = {
  name: 'ARRAYIFY',
  description: `
Replaces a context value with an array of deep copies of that value.

dimension controls how many independent clones are created. It may be a
numeric literal, a normal RustScript reference (array length, object key
count, or number), or the special collection refs tx.from / tx.to /
tx.path / tx.from.p2sh / tx.to.p2sh.

Only context.* destinations are writable.
`,
  exampleScript: {
    op: 'ARRAYIFY',
    reference: 'context.constitution',
    dimension: 'tx.to.p2sh'
  },
  schema: {
    reference: 'string',
    dimension: 'reference'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const reference = node.reference;
    if (typeof reference !== 'string' || reference.length === 0) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(node, 'dimension')) {
      return false;
    }

    if (!reference.startsWith('context.')) {
      return false;
    }

    const path = reference.slice('context.'.length);
    if (!path || isForbiddenWritePath(path)) {
      return false;
    }

    const dimension = resolveDimension(node.dimension, context);
    if (dimension === null) {
      return false;
    }

    const original = getContextPath(context, path);
    if (original === undefined) {
      return false;
    }

    const clones = [];
    for (let i = 0; i < dimension; i += 1) {
      clones.push(deepClone(original));
    }

    return setContextPath(context, path, clones);
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

function getContextPath(root, path) {
  const segments = pathSegments(path);
  if (!segments.length) {
    return undefined;
  }
  let current = root;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const asIndex = /^[0-9]+$/.test(segment) ? Number(segment) : null;
    if (asIndex !== null) {
      if (!Array.isArray(current) || asIndex >= current.length) {
        return undefined;
      }
      current = current[asIndex];
      continue;
    }
    if (
      !current ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
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

function dimensionFromValue(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length;
  }
  return null;
}

function countP2shSlips(slips) {
  if (!Array.isArray(slips)) {
    return 0;
  }
  let count = 0;
  for (let i = 0; i < slips.length; i += 1) {
    const slip = slips[i];
    if (!slip || typeof slip !== 'object') {
      continue;
    }
    // Mirror Rust: skip Bound; P2SH custody marked by public_key[0] == 0x00.
    if (slip.slip_type === 'Bound' || slip.slip_type === 9) {
      continue;
    }
    const pk = slip.public_key || slip.publicKey;
    if (typeof pk === 'string' && pk.length > 0) {
      // base58 keys are opaque here; editor path may pass hex prefix bytes
      continue;
    }
    if (Array.isArray(pk) && pk[0] === 0) {
      count += 1;
      continue;
    }
    if (pk && typeof pk === 'object' && pk[0] === 0) {
      count += 1;
    }
  }
  return count;
}

function resolveDimension(dimension, context) {
  const resolved = resolveRef(context, dimension);
  const fromResolved = dimensionFromValue(resolved);
  if (fromResolved !== null) {
    return fromResolved;
  }

  if (typeof dimension !== 'string') {
    return null;
  }

  if (dimension === 'tx.from') {
    return context.tx && Array.isArray(context.tx.from) ? context.tx.from.length : null;
  }
  if (dimension === 'tx.to') {
    return context.tx && Array.isArray(context.tx.to) ? context.tx.to.length : null;
  }
  if (dimension === 'tx.path') {
    return context.tx && Array.isArray(context.tx.path) ? context.tx.path.length : null;
  }
  if (dimension === 'tx.to.p2sh') {
    return context.tx ? countP2shSlips(context.tx.to) : null;
  }
  if (dimension === 'tx.from.p2sh') {
    return context.tx ? countP2shSlips(context.tx.from) : null;
  }

  return null;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
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
