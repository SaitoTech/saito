const enc = new TextEncoder();
const dec = new TextDecoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const out = new Uint8Array(2);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  return out;
}

function u32(value) {
  const out = new Uint8Array(4);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  out[2] = (value >>> 16) & 0xff;
  out[3] = (value >>> 24) & 0xff;
  return out;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  (files || []).forEach((file) => {
    const name = String(file.name || '').replace(/^\/+/, '');
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data || []);
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data
    ]);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  });

  const centralStart = offset;
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralSize),
    u32(centralStart),
    u16(0)
  ]);

  return concat([...locals, ...centrals, end]);
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (
    (bytes[offset]
      | (bytes[offset + 1] << 8)
      | (bytes[offset + 2] << 16)
      | (bytes[offset + 3] << 24)) >>> 0
  );
}

function findEndOfCentralDirectory(bytes) {
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (readU32(bytes, i) === 0x06054b50) {
      return i;
    }
  }
  return -1;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Compressed ZIP entries are not supported in this browser.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZip(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const end = findEndOfCentralDirectory(source);
  if (end < 0) {
    throw new Error('That ZIP archive could not be read.');
  }

  const count = readU16(source, end + 8);
  let cursor = readU32(source, end + 16);
  const entries = [];

  for (let i = 0; i < count; i += 1) {
    if (readU32(source, cursor) !== 0x02014b50) {
      throw new Error('That ZIP archive could not be read.');
    }
    const method = readU16(source, cursor + 10);
    const compressedSize = readU32(source, cursor + 20);
    const nameLength = readU16(source, cursor + 28);
    const extraLength = readU16(source, cursor + 30);
    const commentLength = readU16(source, cursor + 32);
    const localOffset = readU32(source, cursor + 42);
    const name = dec.decode(source.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    if (readU32(source, localOffset) !== 0x04034b50) {
      throw new Error('That ZIP archive could not be read.');
    }
    const localNameLength = readU16(source, localOffset + 26);
    const localExtraLength = readU16(source, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = source.subarray(dataStart, dataStart + compressedSize);
    let data = compressed;
    if (method === 8) {
      data = await inflateRaw(compressed);
    } else if (method !== 0) {
      throw new Error('That ZIP archive uses an unsupported compression method.');
    }
    if (!name.endsWith('/')) {
      entries.push({ name, data });
    }
  }

  return entries;
}

function looksLikeZip(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  return source.length >= 4
    && source[0] === 0x50
    && source[1] === 0x4b
    && (source[2] === 0x03 || source[2] === 0x05 || source[2] === 0x07);
}

function isZipFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return name.endsWith('.zip')
    || type === 'application/zip'
    || type === 'application/x-zip-compressed';
}

module.exports = {
  createZip,
  readZip,
  looksLikeZip,
  isZipFile
};
