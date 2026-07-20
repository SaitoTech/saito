/**
 * Purpose: SETARRAYFIELD opcode — write a field on each destination object
 * from a parallel source list (with last-value / scalar broadcasting).
 *
 * Language shape:
 *   script.destination  — context.* path to an array of objects
 *   script.source       — array, scalar, or tx collection ref
 *   script.field        — literal property name (not resolve_ref)
 *
 * destination[i][field] = source[min(i, source.len()-1)]
 *
 * Empty source arrays fail. Non-object destination elements fail.
 */

module.exports = {
  name: 'SETARRAYFIELD',
  description: `
Writes a named field on every object in a destination array.

source may be an array, a scalar (broadcast), or a transaction collection
(tx.from, tx.to, tx.path, tx.from.p2sh, tx.to.p2sh). When the source is
shorter than the destination, the last source value repeats.

field is a literal property name — it is not resolved as a reference.
`,
  exampleScript: {
    op: 'SETARRAYFIELD',
    destination: 'context.constitution',
    source: '__opcodes.importarray.successors',
    field: 'owner'
  },
  schema: {
    destination: 'string',
    source: 'reference',
    field: 'string'
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

    const field = node.field;
    if (typeof field !== 'string' || field.length === 0) {
      return false;
    }

    if (!destination.startsWith('context.')) {
      return false;
    }

    const path = destination.slice('context.'.length);
    if (!path || isForbiddenWritePath(path)) {
      return false;
    }

    const sourceValues = resolveSourceValues(node.source, context);
    if (!sourceValues || sourceValues.length === 0) {
      return false;
    }

    const dest = getContextPath(context, path);
    if (!Array.isArray(dest)) {
      return false;
    }
    if (!dest.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
      return false;
    }

    const lastIdx = sourceValues.length - 1;
    for (let i = 0; i < dest.length; i += 1) {
      const srcIdx = i < sourceValues.length ? i : lastIdx;
      dest[i][field] = deepClone(sourceValues[srcIdx]);
    }

    return true;
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

function resolveSpecialCollection(name, context) {
  if (!context.tx || typeof context.tx !== 'object') {
    return null;
  }
  if (name === 'tx.from') {
    return Array.isArray(context.tx.from) ? context.tx.from : null;
  }
  if (name === 'tx.to') {
    return Array.isArray(context.tx.to) ? context.tx.to : null;
  }
  if (name === 'tx.path') {
    return Array.isArray(context.tx.path) ? context.tx.path : null;
  }
  if (name === 'tx.from.p2sh') {
    return Array.isArray(context.tx.from) ? context.tx.from.filter(isP2shSlip) : null;
  }
  if (name === 'tx.to.p2sh') {
    return Array.isArray(context.tx.to) ? context.tx.to.filter(isP2shSlip) : null;
  }
  return null;
}

function resolveSourceValues(source, context) {
  const resolved = resolveRef(context, source);
  if (Array.isArray(resolved)) {
    return resolved.length === 0 ? null : resolved;
  }

  if (typeof source === 'string') {
    switch (source) {
      case 'tx.from':
      case 'tx.to':
      case 'tx.path':
      case 'tx.from.p2sh':
      case 'tx.to.p2sh': {
        const values = resolveSpecialCollection(source, context);
        if (!values || values.length === 0) {
          return null;
        }
        return values;
      }
      default:
        break;
    }
  }

  return [resolved];
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
