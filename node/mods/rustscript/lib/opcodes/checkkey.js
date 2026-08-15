/**
 * Purpose: CHECKKEY opcode — object key presence / allowlist / denylist.
 *
 * Language shape:
 *   script.field     — object path (e.g. "db")
 *   script.operator  — "==" | "!=" | "IN" | "NOT"
 *   script.key       — string key name (== / !=) OR array of key names (IN / NOT)
 *
 * IN  → every key present on the object is in the supplied list
 * NOT → none of the supplied keys is present on the object
 */

module.exports = {
  name: 'CHECKKEY',
  description: `
Tests object keys (never values).

==   → key exists
!=   → key does not exist
IN   → every key present on the object is in the supplied list
NOT  → none of the supplied keys is present on the object
`,
  exampleScript: {
    op: 'CHECKKEY',
    field: 'db',
    operator: 'IN',
    key: ['field1', 'field2', 'field3']
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const operator = node.operator;
    if (typeof operator !== 'string' || operator.length === 0) {
      return false;
    }

    const object = resolveRef(context, node.field);
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
      return false;
    }

    if (operator === '==' || operator === '!=') {
      let keyName = resolveRef(context, node.key);
      if (typeof keyName === 'string' && Object.prototype.hasOwnProperty.call(context, keyName)) {
        keyName = context[keyName];
      }
      if (typeof keyName !== 'string' || keyName.length === 0) {
        return false;
      }
      const present = Object.prototype.hasOwnProperty.call(object, keyName);
      if (operator === '==') {
        return present === true;
      }
      return present === false;
    }

    if (operator === 'IN' || operator === 'NOT') {
      let list = node.key;
      if (typeof list === 'string') {
        list = resolveRef(context, list);
      }
      if (!Array.isArray(list)) {
        return false;
      }

      const names = [];
      for (let i = 0; i < list.length; i += 1) {
        let item = resolveRef(context, list[i]);
        if (typeof item === 'string' && Object.prototype.hasOwnProperty.call(context, item)) {
          item = context[item];
        }
        if (typeof item !== 'string') {
          return false;
        }
        names.push(item);
      }

      const objectKeys = Object.keys(object);
      if (operator === 'IN') {
        for (let i = 0; i < objectKeys.length; i += 1) {
          if (names.indexOf(objectKeys[i]) === -1) {
            return false;
          }
        }
        return true;
      }

      for (let i = 0; i < names.length; i += 1) {
        if (Object.prototype.hasOwnProperty.call(object, names[i])) {
          return false;
        }
      }
      return true;
    }

    return false;
  }
};

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
