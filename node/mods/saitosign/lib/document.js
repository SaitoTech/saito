const ACTION_TYPES = {
  signature: 'signature',
  initial: 'initial',
  date: 'date'
};

function emptyDocument() {
  return {
    document: {
      name: '',
      pdf: '',
      page_count: 0,
      page_width: 0,
      page_height: 0,
      url: ''
    },
    users: [],
    actions: [],
    edited: false
  };
}

function isPdf(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return type === 'application/pdf' || name.endsWith('.pdf');
}

function revoke(record) {
  const url = record?.document?.url;
  if (url && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
  if (record?.document) {
    record.document.url = '';
  }
}

function addUser(record, name) {
  record.users.push({
    name: String(name || '').trim(),
    email: '',
    publickey: '',
    verifications: [],
    signatures: []
  });
  record.edited = true;
  return record.users.length - 1;
}

function renameUser(record, index, name) {
  const user = record.users[index];
  const next = String(name || '').trim();
  if (!user || !next || user.name === next) {
    return;
  }
  user.name = next;
  record.edited = true;
}

function removeUser(record, index) {
  if (!record.users[index]) {
    return;
  }
  record.users.splice(index, 1);
  record.actions = record.actions
    .filter((action) => action.user !== index)
    .map((action) => ({
      ...action,
      user: action.user > index ? action.user - 1 : action.user
    }));
  stripSignatures(record);
  record.edited = true;
}

function addAction(record, action) {
  const id = record.actions.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const next = {
    id,
    type: ACTION_TYPES[action.type] ? action.type : 'signature',
    user: action.user,
    page: action.page,
    x: action.x,
    y: action.y,
    width: action.width,
    height: action.height
  };
  record.actions.push(next);
  stripSignatures(record);
  record.edited = true;
  return next;
}

function stripSignatures(record) {
  (record.users || []).forEach((user) => {
    user.signatures = [];
  });
}

function actionById(record, id) {
  const wanted = Number(id);
  return record.actions.find((action) => action.id === wanted) || null;
}

function removeAction(record, id) {
  const wanted = Number(id);
  const before = record.actions.length;
  record.actions = record.actions.filter((action) => action.id !== wanted);
  if (record.actions.length !== before) {
    record.edited = true;
  }
}

function actionsOnPage(record, page) {
  return record.actions.filter((action) => action.page === page);
}

function copy(record) {
  return {
    document: {
      name: record.document?.name || '',
      pdf: record.document?.pdf || '',
      page_count: record.document?.page_count || 0,
      page_width: record.document?.page_width || 0,
      page_height: record.document?.page_height || 0
    },
    users: (record.users || []).map((user) => ({
      name: user.name || '',
      email: user.email || '',
      publickey: user.publickey || '',
      verifications: (user.verifications || []).map((entry) => ({
        method: entry.method || '',
        publickey: entry.publickey || '',
        message: entry.message || '',
        signature: entry.signature || ''
      })),
      signatures: (user.signatures || []).map((entry) => ({
        id: entry.id,
        signature: entry.signature || ''
      }))
    })),
    actions: (record.actions || []).map((action) => ({
      id: action.id,
      type: action.type,
      user: action.user,
      page: action.page,
      x: action.x,
      y: action.y,
      width: action.width,
      height: action.height
    }))
  };
}

async function openPdf(file) {
  const record = emptyDocument();
  record.document = await readFile(file);
  return record;
}

async function hydrate(saved) {
  const record = emptyDocument();
  record.document.name = saved.document?.name || 'document.pdf';
  record.document.pdf = saved.document?.pdf || '';
  record.users = Array.isArray(saved.users) ? saved.users : [];
  record.actions = Array.isArray(saved.actions) ? saved.actions : [];
  record.edited = saved.edited === true || record.actions.length > 0;
  const parsed = await readBase64(record.document.pdf, record.document.name);
  record.document = parsed;
  return record;
}

async function readFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return describe(bytes, file.name || 'document.pdf');
}

async function readBase64(pdf, name) {
  const bytes = Uint8Array.from(Buffer.from(pdf, 'base64'));
  return describe(bytes, name || 'document.pdf');
}

async function describe(bytes, name) {
  const text = binaryString(bytes);
  if (!text.slice(0, 1024).includes('%PDF')) {
    throw new Error('not a pdf');
  }
  const file = new File([bytes], name, { type: 'application/pdf' });
  const [page_width, page_height] = pageSize(text);
  return {
    name,
    pdf: Buffer.from(bytes).toString('base64'),
    page_count: await readPageCount(text),
    page_width,
    page_height,
    url:
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : ''
  };
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

module.exports = {
  ACTION_TYPES,
  emptyDocument,
  isPdf,
  revoke,
  addUser,
  renameUser,
  removeUser,
  addAction,
  stripSignatures,
  actionById,
  removeAction,
  actionsOnPage,
  copy,
  openPdf,
  hydrate
};
