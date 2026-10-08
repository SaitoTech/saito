const fs = require('fs');
const path = require('path');
const base58 = require('base-58');

const HEADER_SIZE = 389;
const BLOCK_NAME = /^(\d+)-([a-f0-9]{64})\.(sai|blk)$/i;

// Keep aligned with core Block::serialize_for_signature / serialize_for_net.
// Hash verification detects incompatible headers and misnamed files; it does
// not validate the signature, transactions or consensus validity of a block.
function parseHeader(header, size, filename, hashBytes) {
  const name = BLOCK_NAME.exec(path.basename(filename));
  if (!name || header.length !== HEADER_SIZE || size < HEADER_SIZE) {
    throw new Error('Unsupported block filename or truncated header');
  }
  const height = Number(header.readBigUInt64BE(4));
  const timestamp = Number(header.readBigUInt64BE(12));
  if (!Number.isSafeInteger(height) || height < 1 || !Number.isSafeInteger(timestamp)) {
    throw new Error('Block height or timestamp outside supported range');
  }
  const parent = header.subarray(20, 52);
  const preimage = Buffer.concat([
    header.subarray(4, 117),
    header.subarray(181, 213),
    header.subarray(221, 285)
  ]);
  const hash = Buffer.from(
    hashBytes(Buffer.concat([parent, Buffer.from(hashBytes(preimage))]))
  ).toString('hex');
  if (hash !== name[2].toLowerCase() || BigInt(name[1]) !== BigInt(timestamp)) {
    throw new Error('Block header does not match filename');
  }
  const tx_count = header.readUInt32BE(0);
  if (size < HEADER_SIZE + tx_count * 93) throw new Error('Truncated transaction body');
  const headerOnly = tx_count === 0 && height > 1 && size === HEADER_SIZE;
  return {
    hash,
    height,
    parent_hash: parent.toString('hex'),
    timestamp,
    creator: base58.encode(header.subarray(52, 85)),
    tx_count: headerOnly ? null : tx_count,
    size_bytes: headerOnly ? null : size,
    file_path: path.resolve(filename),
    body_available: !headerOnly,
    in_longest_chain: null
  };
}

async function readBlockMetadata(filename, hashBytes) {
  const handle = await fs.promises.open(filename, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Not a regular block file');
    const header = Buffer.alloc(HEADER_SIZE);
    const { bytesRead } = await handle.read(header, 0, HEADER_SIZE, 0);
    return parseHeader(header.subarray(0, bytesRead), stat.size, filename, hashBytes);
  } finally {
    await handle.close();
  }
}

// Streaming traversal: no directory-sized array, no symlink traversal.
async function* blockFiles(root, recursive = false) {
  const directory = await fs.promises.opendir(root);
  for await (const entry of directory) {
    const filename = path.join(root, entry.name);
    if (entry.isFile() && BLOCK_NAME.test(entry.name)) yield filename;
    else if (recursive && entry.isDirectory()) yield* blockFiles(filename, true);
  }
}

module.exports = { HEADER_SIZE, BLOCK_NAME, parseHeader, readBlockMetadata, blockFiles };
