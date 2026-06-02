/**
 * Purpose: Produce deterministic Blake3 hash for a script object.
 */

const blake3 = require('blake3');

function script_to_scripthash(script) {
  if (!script || typeof script !== 'object' || Array.isArray(script)) {
    return false;
  }

  let json = '';
  const seen = new Set();
  const stack = [{ value: script, state: 0, index: 0, keys: null, isArray: false }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const value = frame.value;

    if (frame.state === 0) {
      if (value === null) {
        json += 'null';
        stack.pop();
        continue;
      }

      const t = typeof value;
      if (t === 'string') {
        json += JSON.stringify(value);
        stack.pop();
        continue;
      }
      if (t === 'number') {
        if (!Number.isFinite(value)) {
          return false;
        }
        json += String(value);
        stack.pop();
        continue;
      }
      if (t === 'boolean') {
        json += value ? 'true' : 'false';
        stack.pop();
        continue;
      }
      if (t !== 'object') {
        return false;
      }

      if (seen.has(value)) {
        return false;
      }
      seen.add(value);

      frame.isArray = Array.isArray(value);
      frame.index = 0;
      frame.keys = frame.isArray ? null : Object.keys(value).sort();
      frame.state = 1;
      json += frame.isArray ? '[' : '{';
      continue;
    }

    if (frame.isArray) {
      if (frame.index >= value.length) {
        json += ']';
        seen.delete(value);
        stack.pop();
        continue;
      }

      if (frame.index > 0) {
        json += ',';
      }

      const child = value[frame.index];
      frame.index += 1;
      stack.push({ value: child, state: 0, index: 0, keys: null, isArray: false });
      continue;
    }

    if (frame.index >= frame.keys.length) {
      json += '}';
      seen.delete(value);
      stack.pop();
      continue;
    }

    if (frame.index > 0) {
      json += ',';
    }

    const key = frame.keys[frame.index];
    frame.index += 1;
    json += JSON.stringify(key) + ':';
    stack.push({ value: value[key], state: 0, index: 0, keys: null, isArray: false });
  }

  return blake3.hash(json).toString('hex');
}

module.exports = script_to_scripthash;
