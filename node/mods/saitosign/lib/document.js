const Signer = require('./signer');
const Field = require('./field');

class Document {
  constructor(app, mod, file, page_count, page_width, page_height) {
    this.app = app;
    this.mod = mod;
    this.file = file;
    this.page_count = page_count;
    this.page_width = page_width;
    this.page_height = page_height;
    this.signers = [];
    this.fields = [];
    this.next_field_id = 1;
    this.edited = false;
    this.url =
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function' &&
      typeof Blob !== 'undefined' &&
      file instanceof Blob
        ? URL.createObjectURL(file)
        : '';
  }

  static isPdf(file) {
    const name = String(file?.name || '').toLowerCase();
    const type = String(file?.type || '').toLowerCase();
    return type === 'application/pdf' || name.endsWith('.pdf');
  }

  static async open(app, mod, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = binaryString(bytes);
    if (!text.slice(0, 1024).includes('%PDF')) {
      throw new Error('not a pdf');
    }

    return new Document(
      app,
      mod,
      file,
      await readPageCount(text),
      ...pageSize(text)
    );
  }

  close() {
    if (this.url && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(this.url);
    }
    this.url = '';
  }

  markEdited() {
    this.edited = true;
  }

  addSigner(name) {
    const signer = new Signer(this.app, this.mod, String(name || '').trim());
    this.signers.push(signer);
    this.markEdited();
    return signer;
  }

  placeField(type, signer, page, x, y, width, height) {
    const field = new Field(this.next_field_id, type, signer, page, x, y, width, height);
    this.next_field_id += 1;
    this.fields.push(field);
    this.markEdited();
    return field;
  }

  fieldById(id) {
    const wanted = Number(id);
    return this.fields.find((field) => field.id === wanted) || null;
  }

  removeField(id) {
    const wanted = Number(id);
    const before = this.fields.length;
    this.fields = this.fields.filter((field) => field.id !== wanted);
    if (this.fields.length !== before) {
      this.markEdited();
    }
  }

  renameSigner(signer, name) {
    const next = String(name || '').trim();
    if (!signer || !this.signers.includes(signer) || !next || signer.name === next) {
      return;
    }
    signer.name = next;
    this.markEdited();
  }

  removeSigner(signer) {
    if (!signer || !this.signers.includes(signer)) {
      return;
    }
    this.fields = this.fields.filter((field) => field.signer !== signer);
    this.signers = this.signers.filter((candidate) => candidate !== signer);
    this.markEdited();
  }

  fieldsOnPage(page) {
    return this.fields.filter((field) => field.page === page);
  }

  static async restore(app, mod, data) {
    const bytes = Uint8Array.from(Buffer.from(data.pdf, 'base64'));
    const file = new File([bytes], data.name || 'document.pdf', { type: 'application/pdf' });
    const document = await Document.open(app, mod, file);

    for (const name of data.signers) {
      document.addSigner(name);
    }

    for (const field of data.fields) {
      document.placeField(
        field.type,
        document.signers[field.signer],
        field.page,
        field.x,
        field.y,
        field.width,
        field.height
      );
    }

    document.edited = false;
    return document;
  }
}

async function readPageCount(text) {
  try {
    const count = await pageCountFromStructure(text);
    if (count >= 1) {
      return count;
    }
  } catch (err) {
    // Encrypted or unusual files still use the plaintext scan below.
  }
  return countPagesFromText(text);
}

// Page trees are often stored in compressed object streams, so a plaintext
// search never sees /Type /Pages or /Count. The count lives on the catalog's
// root Pages node.
async function pageCountFromStructure(text) {
  const xref = new Map();
  const cache = new Map();
  const streams = new Map();
  let root = null;

  const marker = text.lastIndexOf('startxref');
  const start = marker >= 0 ? text.slice(marker).match(/startxref\s+(\d+)/) : null;
  if (!start) {
    throw new Error('startxref');
  }

  await ingestXref(text, Number(start[1]), xref, (next) => {
    root = next;
  });

  if (!root) {
    throw new Error('root');
  }

  const catalog = await loadObject(text, xref, cache, streams, root);
  const pagesRef = catalog && catalog.Pages;
  const pages = pagesRef && pagesRef.obj != null
    ? await loadObject(text, xref, cache, streams, pagesRef)
    : pagesRef;
  const count = pages && pages.Count;
  if (typeof count !== 'number' || count < 1) {
    throw new Error('count');
  }
  return count;
}

async function ingestXref(text, offset, xref, setRoot) {
  const seen = new Set();

  async function readAt(at) {
    if (seen.has(at)) {
      return;
    }
    seen.add(at);
    const i = skipSpace(text, at);
    if (text.startsWith('xref', i)) {
      const table = parseClassicXref(text, i);
      if (table.trailer.Prev) {
        await readAt(table.trailer.Prev);
      }
      for (const entry of table.entries) {
        xref.set(entry.obj, entry);
      }
      if (table.trailer.Root) {
        setRoot(table.trailer.Root);
      }
      return;
    }

    const record = readFileObject(text, i);
    const loaded = await materialize(record);
    const dict = loaded.dict || record.value;
    if (dict.Prev) {
      await readAt(dict.Prev);
    }
    applyXrefStream(dict, loaded.bytes, xref);
    if (dict.Root) {
      setRoot(dict.Root);
    }
  }

  await readAt(offset);
}

function applyXrefStream(dict, bytes, xref) {
  const widths = dict.W;
  if (!widths || !bytes) {
    throw new Error('xref stream');
  }
  const typeW = widths[0] || 0;
  const offW = widths[1] || 0;
  const genW = widths[2] || 0;
  const width = typeW + offW + genW;
  const index = dict.Index || [0, dict.Size];
  let cursor = 0;

  for (let section = 0; section < index.length; section += 2) {
    let obj = index[section];
    const count = index[section + 1];
    for (let n = 0; n < count; n += 1, obj += 1) {
      const row = bytes.subarray(cursor, cursor + width);
      cursor += width;
      const type = typeW ? readInt(row, 0, typeW) : 1;
      const field2 = offW ? readInt(row, typeW, offW) : 0;
      const field3 = genW ? readInt(row, typeW + offW, genW) : 0;
      if (type === 1) {
        xref.set(obj, { obj, type: 1, offset: field2, gen: field3 });
      } else if (type === 2) {
        xref.set(obj, { obj, type: 2, stream: field2, index: field3 });
      } else {
        xref.set(obj, { obj, type: 0 });
      }
    }
  }
}

async function loadObject(text, xref, cache, streams, ref) {
  const id = ref.obj;
  if (cache.has(id)) {
    return cache.get(id);
  }

  const entry = xref.get(id);
  if (!entry || entry.type === 0) {
    return null;
  }

  if (entry.type === 2) {
    const list = await loadObjectStream(text, xref, cache, streams, entry.stream);
    const value = list[entry.index];
    cache.set(id, value);
    return value;
  }

  const record = readFileObject(text, entry.offset);
  const value = await materialize(record);
  const result = record.stream ? value : record.value;
  cache.set(id, result);
  return result;
}

async function loadObjectStream(text, xref, cache, streams, id) {
  if (streams.has(id)) {
    return streams.get(id);
  }

  const loaded = await loadObject(text, xref, cache, streams, { obj: id, gen: 0 });
  const dict = loaded.dict || loaded;
  const bytes = loaded.bytes;
  const header = binaryString(bytes.subarray(0, dict.First));
  const nums = header.trim().split(/\s+/).map(Number);
  const objects = [];
  for (let n = 0; n < dict.N; n += 1) {
    const start = dict.First + nums[n * 2 + 1];
    const end = n + 1 < dict.N ? dict.First + nums[(n + 1) * 2 + 1] : bytes.length;
    const piece = binaryString(bytes.subarray(start, end));
    objects.push(parseValue(piece, 0).value);
  }
  streams.set(id, objects);
  return objects;
}

function readFileObject(text, offset) {
  let i = skipSpace(text, offset);
  const head = text.slice(i).match(/^(\d+)\s+(\d+)\s+obj\s*/);
  if (!head) {
    throw new Error('obj');
  }
  i += head[0].length;
  const parsed = parseValue(text, i);
  i = skipSpace(text, parsed.index);
  if (!text.startsWith('stream', i)) {
    return { value: parsed.value, stream: null };
  }

  const length = parsed.value && parsed.value.Length;
  if (typeof length !== 'number') {
    throw new Error('stream length');
  }
  i += 'stream'.length;
  if (text[i] === '\r') {
    i += 1;
  }
  if (text[i] === '\n') {
    i += 1;
  }
  return { value: parsed.value, stream: bytesAt(text, i, length) };
}

async function materialize(record) {
  if (!record.stream) {
    return record.value;
  }

  let bytes = record.stream;
  const filter = record.value.Filter;
  const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
  if (filters.includes('FlateDecode')) {
    bytes = await inflateFlate(bytes);
    const parms = decodeParms(record.value);
    if (parms && parms.Predictor >= 10) {
      bytes = unpredict(bytes, parms.Columns || 1);
    }
  }
  return { dict: record.value, bytes };
}

function decodeParms(dict) {
  const parms = dict.DecodeParms;
  if (!parms) {
    return null;
  }
  if (Array.isArray(parms)) {
    return parms.find((item) => item && item.Predictor) || parms[0];
  }
  return parms;
}

async function inflateFlate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unpredict(data, columns) {
  const rowSize = columns + 1;
  const rows = Math.floor(data.length / rowSize);
  const out = new Uint8Array(rows * columns);
  let previous = new Uint8Array(columns);

  for (let row = 0; row < rows; row += 1) {
    const filter = data[row * rowSize];
    const current = new Uint8Array(columns);
    for (let column = 0; column < columns; column += 1) {
      const raw = data[row * rowSize + 1 + column];
      const left = column > 0 ? current[column - 1] : 0;
      const up = previous[column];
      const upLeft = column > 0 ? previous[column - 1] : 0;
      let value = raw;
      if (filter === 1) {
        value = (raw + left) & 255;
      } else if (filter === 2) {
        value = (raw + up) & 255;
      } else if (filter === 3) {
        value = (raw + ((left + up) >> 1)) & 255;
      } else if (filter === 4) {
        const estimate = left + up - upLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - up);
        const pc = Math.abs(estimate - upLeft);
        const predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = (raw + predicted) & 255;
      }
      current[column] = value;
    }
    out.set(current, row * columns);
    previous = current;
  }
  return out;
}

function readInt(bytes, offset, width) {
  let value = 0;
  for (let i = 0; i < width; i += 1) {
    value = value * 256 + bytes[offset + i];
  }
  return value;
}

// TextDecoder('latin1') is windows-1252 in browsers, so bytes 0x80-0x9F do not
// round-trip. PDF streams have to stay byte-for-byte or FlateDecode fails.
function binaryString(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  }
  return text;
}

function bytesAt(text, start, length) {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = text.charCodeAt(start + i) & 255;
  }
  return out;
}

function parseClassicXref(text, i) {
  i = skipSpace(text, i) + 4;
  const entries = [];
  while (true) {
    i = skipSpace(text, i);
    if (text.startsWith('trailer', i)) {
      break;
    }
    const subsection = text.slice(i).match(/^(\d+)\s+(\d+)\s*/);
    if (!subsection) {
      break;
    }
    i += subsection[0].length;
    const first = Number(subsection[1]);
    const count = Number(subsection[2]);
    for (let n = 0; n < count; n += 1) {
      const line = text.slice(i).match(/^(\d+)\s+(\d+)\s+([nf])\s*/);
      if (!line) {
        throw new Error('xref line');
      }
      entries.push({
        obj: first + n,
        type: line[3] === 'n' ? 1 : 0,
        offset: Number(line[1]),
        gen: Number(line[2])
      });
      i += line[0].length;
    }
  }
  const trailer = parseValue(text, i + 'trailer'.length).value;
  return { entries, trailer };
}

function parseValue(text, i) {
  i = skipSpace(text, i);
  if (text.startsWith('<<', i)) {
    return parseDict(text, i);
  }
  if (text[i] === '[') {
    return parseArray(text, i);
  }
  if (text[i] === '(') {
    return parseLiteral(text, i);
  }
  if (text[i] === '<') {
    return parseHex(text, i);
  }
  if (text[i] === '/') {
    return parseName(text, i);
  }
  if (text.startsWith('true', i)) {
    return { value: true, index: i + 4 };
  }
  if (text.startsWith('false', i)) {
    return { value: false, index: i + 5 };
  }
  if (text.startsWith('null', i)) {
    return { value: null, index: i + 4 };
  }

  const number = text.slice(i).match(/^[+-]?(?:\d+\.\d*|\.\d+|\d+)/);
  if (!number) {
    throw new Error('value');
  }
  const raw = number[0];
  let index = i + raw.length;
  if (!raw.includes('.')) {
    const ref = text.slice(index).match(/^\s+(\d+)\s+R(?![\w])/);
    if (ref) {
      return {
        value: { obj: Number(raw), gen: Number(ref[1]) },
        index: index + ref[0].length
      };
    }
  }
  return { value: Number(raw), index };
}

function parseDict(text, i) {
  const dict = {};
  i += 2;
  while (true) {
    i = skipSpace(text, i);
    if (text.startsWith('>>', i)) {
      return { value: dict, index: i + 2 };
    }
    const name = parseName(text, i);
    const parsed = parseValue(text, name.index);
    dict[name.value] = parsed.value;
    i = parsed.index;
  }
}

function parseArray(text, i) {
  const values = [];
  i += 1;
  while (true) {
    i = skipSpace(text, i);
    if (text[i] === ']') {
      return { value: values, index: i + 1 };
    }
    const parsed = parseValue(text, i);
    values.push(parsed.value);
    i = parsed.index;
  }
}

function parseName(text, i) {
  let index = i + 1;
  let name = '';
  while (index < text.length && !' \n\r\t\f<>[]()/%'.includes(text[index])) {
    if (text[index] === '#') {
      name += String.fromCharCode(parseInt(text.slice(index + 1, index + 3), 16));
      index += 3;
      continue;
    }
    name += text[index];
    index += 1;
  }
  return { value: name, index };
}

function parseLiteral(text, i) {
  let depth = 1;
  i += 1;
  while (i < text.length && depth) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === '(') {
      depth += 1;
    } else if (text[i] === ')') {
      depth -= 1;
    }
    i += 1;
  }
  return { value: '', index: i };
}

function parseHex(text, i) {
  const end = text.indexOf('>', i + 1);
  return { value: '', index: end + 1 };
}

function skipSpace(text, i) {
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0') {
      i += 1;
      continue;
    }
    if (c === '%') {
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') {
        i += 1;
      }
      continue;
    }
    break;
  }
  return i;
}

function countPagesFromText(text) {
  const counts = [];
  const markers = text.matchAll(/\/Type\s*\/Pages\b/g);
  for (const marker of markers) {
    const forward = text.slice(marker.index, marker.index + 400);
    let count = forward.match(/\/Count\s+(\d+)/);
    if (!count) {
      const backward = text.slice(Math.max(0, marker.index - 80), marker.index);
      const found = [...backward.matchAll(/\/Count\s+(\d+)/g)];
      count = found.length ? found[found.length - 1] : null;
    }
    if (count) {
      counts.push(Number(count[1]));
    }
  }

  if (counts.length) {
    return Math.max(...counts);
  }

  const linear = text.slice(0, 4096).match(/\/Linearized[\s\S]{0,160}?\/N\s+(\d+)/);
  if (linear) {
    return Math.max(1, Number(linear[1]));
  }

  const pages = text.match(/\/Type\s*\/Page(?!s)\b/g);
  if (pages && pages.length) {
    return pages.length;
  }

  return 1;
}

function pageSize(text) {
  const box = text.match(
    /\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/
  );
  if (!box) {
    return [612, 792];
  }

  const width = Math.abs(Number(box[3]) - Number(box[1]));
  const height = Math.abs(Number(box[4]) - Number(box[2]));
  if (!width || !height) {
    return [612, 792];
  }

  return [width, height];
}

module.exports = Document;
