/**
 * Purpose: SETARRAY opcode — replace a context location with a deep-cloned array.
 *
 * Language shape:
 *   script.destination  — context.* path to overwrite
 *   script.source       — array (resolve_ref or tx collection ref)
 *
 * Special unresolved sources: tx.from / tx.to / tx.path / tx.from.p2sh / tx.to.p2sh
 * resolve to the corresponding collections (not their lengths).
 *
 * Read-only destinations (script.*, witness.*, tx.*, blk.*) are rejected.
 */

module.exports = {
  name: 'SETARRAY',
  description: `
Replaces a writable context location with a deep clone of a source array.

destination must be a context.* path. source is resolved via normal RustScript
references, or as a transaction collection (tx.from, tx.to, tx.path,
tx.from.p2sh, tx.to.p2sh) when unresolved.

The source is not modified.
`,
  exampleScript: {
    op: 'SETARRAY',
    destination: 'context.successors',
    source: '__opcodes.importarray.successors'
  },
  schema: {
    destination: 'string',
    source: 'reference'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const destination = node.destination;
    if (typeof destination !== 'string' || destination.length === 0) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(node, 'source')) {
      return false;
    }

    if (!destination.startsWith('context.')) {
      return false;
    }

    const path = destination.slice('context.'.length);
    if (!path || isForbiddenWritePath(path)) {
      return false;
    }

    const sourceArray = resolveSourceArray(node.source, context);
    if (!Array.isArray(sourceArray)) {
      return false;
    }

    return setContextPath(context, path, deepClone(sourceArray));
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

function isP2shSlip(slip) {
  if (!slip || typeof slip !== 'object') {
    return false;
  }
  if (slip.slip_type === 'Bound' || slip.slip_type === 9) {
    return false;
  }
  const pk = slip.public_key || slip.publicKey;
  if (Array.isArray(pk) && pk[0] === 0) {
    return true;
  }
  if (pk && typeof pk === 'object' && pk[0] === 0) {
    return true;
  }
  return false;
}

function resolveSourceArray(source, context) {
  const resolved = resolveRef(context, source);
  if (Array.isArray(resolved)) {
    return resolved;
  }

  if (typeof source !== 'string') {
    return null;
  }

  if (!context.tx || typeof context.tx !== 'object') {
    if (source === 'tx.from' || source === 'tx.to' || source === 'tx.path'
      || source === 'tx.from.p2sh' || source === 'tx.to.p2sh') {
      return null;
    }
  }

  if (source === 'tx.from') {
    return Array.isArray(context.tx.from) ? context.tx.from : null;
  }
  if (source === 'tx.to') {
    return Array.isArray(context.tx.to) ? context.tx.to : null;
  }
  if (source === 'tx.path') {
    return Array.isArray(context.tx.path) ? context.tx.path : null;
  }
  if (source === 'tx.from.p2sh') {
    return Array.isArray(context.tx.from) ? context.tx.from.filter(isP2shSlip) : null;
  }
  if (source === 'tx.to.p2sh') {
    return Array.isArray(context.tx.to) ? context.tx.to.filter(isP2shSlip) : null;
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
