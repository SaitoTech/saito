const PLACEHOLDER_PATTERN = /^<([^<>]+)>$/;

const PLACEHOLDER_META = {
  signature: {
    label: 'Signature',
    hint: 'Witness signature required to unlock this condition',
    action: 'signature'
  },
  signatures: {
    label: 'Signatures',
    hint: 'Array of witness signatures (M-of-N)',
    action: 'text'
  },
  publickey: {
    label: 'Public key',
    hint: 'Saito public key for this contract field',
    action: 'publickey'
  },
  hash: {
    label: 'Hash',
    hint: 'Expected hash digest (Blake3)',
    action: 'hash'
  },
  timestamp: {
    label: 'Timestamp',
    hint: 'Block/time comparison target',
    action: 'timestamp'
  },
  input: {
    label: 'Input',
    hint: 'Witness preimage to hash',
    action: 'text'
  },
  msg: {
    label: 'Message',
    hint: 'Message that was signed',
    action: 'text'
  },
  nftid: {
    label: 'NFT ID',
    hint: 'NFT identifier',
    action: 'text'
  },
  utxokey: {
    label: 'UTXO key',
    hint: 'Slip UTXO key',
    action: 'text'
  },
  utxokey1: {
    label: 'UTXO key 1',
    hint: 'First NFT slip UTXO key',
    action: 'text'
  },
  utxokey2: {
    label: 'UTXO key 2',
    hint: 'Second NFT slip UTXO key',
    action: 'text'
  },
  utxokey3: {
    label: 'UTXO key 3',
    hint: 'Third NFT slip UTXO key',
    action: 'text'
  },
  hops: {
    label: 'Routing hops',
    hint: 'Signed routing path witness array',
    action: 'text'
  }
};

function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER_PATTERN.test(value.trim());
}

function placeholderName(value) {
  const match = String(value).trim().match(PLACEHOLDER_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

function placeholderMeta(value) {
  const name = placeholderName(value);
  if (!name) {
    return null;
  }
  return (
    PLACEHOLDER_META[name] || {
      label: name,
      hint: `Provide value for <${name}>`,
      action: 'text'
    }
  );
}

function setAtPath(root, path, value) {
  if (!path || path.length === 0) {
    return value;
  }
  let cursor = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
  return root;
}

function getAtPath(root, path) {
  let cursor = root;
  for (const key of path) {
    if (cursor == null) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor;
}

module.exports = {
  isPlaceholder,
  placeholderName,
  placeholderMeta,
  setAtPath,
  getAtPath
};
