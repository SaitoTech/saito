const { createPrepareTransaction, looksLikeWebTransaction } = require('./transaction');
const { createZip } = require('./zip');

const ARCHIVE_README = 'This is a SaitoSign zip archive. To sign this document, visit sato.io/SaitoSign, and copy the zip file or the SaitoSign file into the UI and follow the instructions.\n';

function archiveBaseName(record) {
  return String(record?.document?.name || 'document.pdf').replace(/\.pdf$/i, '') || 'document';
}

function pdfZipEntries(record) {
  const used = new Set();
  const list = Array.isArray(record?.document?.pdf) ? record.document.pdf : [];
  return list.map((entry, index) => ({
    name: `PDFs/${safePdfFilename(entry?.name, index, used)}`,
    data: Uint8Array.from(Buffer.from(String(entry?.pdf || ''), 'base64'))
  }));
}

function safePdfFilename(original, index, used) {
  let base = String(original || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .trim()
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .replace(/^\.+/, '');
  if (!base) {
    base = `document-${index + 1}.pdf`;
  }
  if (!/\.pdf$/i.test(base)) {
    base = `${base}.pdf`;
  }
  let name = base;
  let suffix = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base.replace(/\.pdf$/i, '')}-${suffix}.pdf`;
    suffix += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function textFromZip(entries) {
  const candidates = [];
  const seen = new Set();
  (entries || []).forEach((entry) => {
    const path = zipEntryPath(entry?.name);
    if (!path) {
      return;
    }
    const parts = path.split('/');
    if (parts[0].toLowerCase() === 'pdfs') {
      return;
    }
    const base = parts[parts.length - 1] || '';
    if (/^readme\.txt$/i.test(base)) {
      return;
    }
    const text = new TextDecoder().decode(entry.data).trim();
    if (!/\.saitosign$/i.test(base) && !looksLikeWebTransaction(text)) {
      return;
    }
    const key = path.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({ path, text });
  });
  if (candidates.length > 1) {
    throw new Error('That ZIP archive contains more than one SaitoSign document.');
  }
  if (!candidates.length) {
    return '';
  }
  return candidates[0].text;
}

function zipEntryPath(name) {
  const parts = String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.');
  if (!parts.length || parts.some((part) => part === '..')) {
    return '';
  }
  return parts.join('/');
}

function bytesToBase64(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < source.length; i += chunk) {
    binary += String.fromCharCode.apply(null, source.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function zipDocumentTransaction(app, record, tx) {
  const base = archiveBaseName(record);
  const bytes = createZip([
    { name: `${base}.saitosign`, data: new TextEncoder().encode(tx.serialize_to_web(app)) },
    { name: 'readme.txt', data: new TextEncoder().encode(ARCHIVE_README) },
    ...pdfZipEntries(record)
  ]);
  return { bytes, filename: `${base}.zip` };
}

async function buildDocumentArchive(app, record) {
  const tx = await createPrepareTransaction(app, record);
  return zipDocumentTransaction(app, record, tx);
}

function zipPackage(bytes) {
  return { format: 'saitosign-zip', archive: bytesToBase64(bytes) };
}

module.exports = {
  ARCHIVE_README,
  buildDocumentArchive,
  zipDocumentTransaction,
  bytesToBase64,
  base64ToBytes,
  textFromZip,
  zipPackage
};
