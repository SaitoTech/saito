const { createHash, randomBytes } = require('crypto');
const { copy } = require('./document');

// SaitoSign has no existing retention period. Stored documents are a temporary
// cache, and each save can override this default.
const DEFAULT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const METADATA_COLUMNS = `
  document_id,
  document_hash,
  created_at,
  updated_at,
  accessed_at,
  tier,
  is_paid,
  is_encrypted,
  expires_at
`;

class DocumentStoreError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DocumentStoreError';
    this.code = code;
  }
}

class SaitoSignDatabase {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  dbname() {
    if (this.mod?.dbname) {
      return this.mod.dbname;
    }
    const slug = typeof this.mod?.returnSlug === 'function' ? this.mod.returnSlug() : 'saitosign';
    return encodeURI(slug);
  }

  async ensureSchema() {
    if (this.app?.BROWSER) {
      return;
    }
    const filesystem = this.app?.storage?.returnFileSystem?.();
    if (!filesystem) {
      throw new DocumentStoreError('SaitoSign document storage is unavailable.', 'storage');
    }
    const sqlPath = `${__dirname}/../sql/documents.sql`;
    if (!filesystem.existsSync(sqlPath)) {
      throw new DocumentStoreError('SaitoSign document schema is missing.', 'storage');
    }
    await this.app.storage.executeDatabase(filesystem.readFileSync(sqlPath, 'utf8'), this.dbname());
  }

  async saveDocument(document, options = {}) {
    const now = timestamp(options.now);
    const encrypted = encryptionChoice(document, options);
    const documentData = encrypted ? String(document) : serializeDocument(document);
    const record = {
      document_id: '',
      document_hash: sha256(documentData),
      document_data: documentData,
      created_at: now,
      updated_at: now,
      accessed_at: now,
      tier: tierValue(options.tier, document),
      is_paid: booleanValue(options.isPaid, false),
      is_encrypted: encrypted,
      expires_at: expiryValue(now, options)
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      record.document_id = randomBytes(16).toString('hex');
      try {
        await this.run(
          `INSERT INTO satosign_documents (
             document_id, document_hash, document_data, created_at, updated_at,
             accessed_at, tier, is_paid, is_encrypted, expires_at
           ) VALUES (
             $document_id, $document_hash, $document_data, $created_at, $updated_at,
             $accessed_at, $tier, $is_paid, $is_encrypted, $expires_at
           )`,
          bind(record)
        );
        break;
      } catch (err) {
        if (attempt < 4 && isUniqueViolation(err)) {
          continue;
        }
        throw storageError(err);
      }
    }

    const stored = await this.readRow(record.document_id);
    if (!stored || stored.document_hash !== record.document_hash) {
      throw new DocumentStoreError('SaitoSign document was not stored.', 'storage');
    }
    return present(stored, now);
  }

  async getDocument(documentId) {
    const id = normalizeId(documentId);
    if (!id) {
      return null;
    }
    const row = await this.readRow(id);
    if (!row) {
      return null;
    }
    assertIntact(row);
    const accessedAt = Date.now();
    await this.run(
      `UPDATE satosign_documents
          SET accessed_at = $accessed_at
        WHERE document_id = $document_id`,
      { $document_id: id, $accessed_at: accessedAt }
    );
    const updated = await this.readRow(id);
    if (!updated || Number(updated.accessed_at) !== accessedAt) {
      throw new DocumentStoreError('SaitoSign document access time was not recorded.', 'storage');
    }
    return present(updated, accessedAt);
  }

  async updateDocument(documentId, document) {
    const id = requireId(documentId);
    const existing = await this.readRow(id);
    if (!existing) {
      throw new DocumentStoreError('SaitoSign document was not found.', 'not_found');
    }
    const documentData = serializeDocument(document);
    const updatedAt = Date.now();
    const documentHash = sha256(documentData);
    await this.run(
      `UPDATE satosign_documents
          SET document_data = $document_data,
              document_hash = $document_hash,
              updated_at = $updated_at,
              is_encrypted = 0
        WHERE document_id = $document_id`,
      {
        $document_id: id,
        $document_data: documentData,
        $document_hash: documentHash,
        $updated_at: updatedAt
      }
    );
    const stored = await this.readRow(id);
    if (
      !stored
      || stored.document_data !== documentData
      || stored.document_hash !== documentHash
      || Number(stored.created_at) !== Number(existing.created_at)
      || Number(stored.updated_at) !== updatedAt
    ) {
      throw new DocumentStoreError('SaitoSign document was not updated.', 'storage');
    }
    return present(stored, Date.now());
  }

  async deleteDocument(documentId) {
    const id = requireId(documentId);
    const existing = await this.readRow(id);
    if (!existing) {
      throw new DocumentStoreError('SaitoSign document was not found.', 'not_found');
    }
    await this.run(
      'DELETE FROM satosign_documents WHERE document_id = $document_id',
      { $document_id: id }
    );
    if (await this.readRow(id)) {
      throw new DocumentStoreError('SaitoSign document was not deleted.', 'storage');
    }
    return true;
  }

  async getDocumentMetadata(documentId) {
    const id = normalizeId(documentId);
    if (!id) {
      return null;
    }
    const rows = await this.query(
      `SELECT ${METADATA_COLUMNS}
         FROM satosign_documents
        WHERE document_id = $document_id
        LIMIT 1`,
      { $document_id: id }
    );
    return rows[0] ? metadata(rows[0], Date.now()) : null;
  }

  async listExpiredDocuments(now = Date.now()) {
    const rows = await this.query(
      `SELECT ${METADATA_COLUMNS}
         FROM satosign_documents
        WHERE expires_at IS NOT NULL AND expires_at <= $now
        ORDER BY expires_at ASC, document_id ASC`,
      { $now: timestamp(now) }
    );
    return rows.map((row) => metadata(row, now));
  }

  async readRow(documentId) {
    const rows = await this.query(
      `SELECT ${METADATA_COLUMNS}, document_data
         FROM satosign_documents
        WHERE document_id = $document_id
        LIMIT 1`,
      { $document_id: documentId }
    );
    return rows[0] || null;
  }

  async query(sql, params) {
    const rows = await this.app.storage.queryDatabase(sql, params, this.dbname());
    if (!Array.isArray(rows)) {
      throw new DocumentStoreError('SaitoSign document query failed.', 'storage');
    }
    return rows;
  }

  async run(sql, params) {
    await this.app.storage.runDatabase(sql, params, this.dbname());
  }
}

function serializeDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new DocumentStoreError('SaitoSign document data must be a document object.', 'invalid');
  }
  return JSON.stringify(copy(document));
}

function encryptionChoice(document, options) {
  if (options.isEncrypted !== true) {
    if (typeof document === 'string') {
      throw new DocumentStoreError('SaitoSign document data must be a document object.', 'invalid');
    }
    return false;
  }
  if (typeof document !== 'string' || !document) {
    throw new DocumentStoreError(
      'An encrypted SaitoSign payload must be the ciphertext string.',
      'invalid'
    );
  }
  return true;
}

function tierValue(requested, document) {
  const candidate = requested == null ? document?.metadata?.tier : requested;
  if (candidate == null || candidate === '') {
    return 'free';
  }
  if (candidate === 'free' || candidate === 'premium') {
    return candidate;
  }
  throw new DocumentStoreError('SaitoSign document tier must be free or premium.', 'invalid');
}

function booleanValue(value, fallback) {
  if (value == null) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new DocumentStoreError('SaitoSign payment status must be boolean.', 'invalid');
  }
  return value;
}

function expiryValue(now, options) {
  if (Object.prototype.hasOwnProperty.call(options, 'expiresAt')) {
    if (options.expiresAt == null) {
      return null;
    }
    return timestamp(options.expiresAt);
  }
  const retention = options.retentionMs == null ? DEFAULT_RETENTION_MS : options.retentionMs;
  return now + timestamp(retention);
}

function timestamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new DocumentStoreError('SaitoSign document timestamp is invalid.', 'invalid');
  }
  return Math.trunc(number);
}

function normalizeId(documentId) {
  const id = String(documentId || '').trim();
  if (!id) {
    return '';
  }
  if (!/^[0-9a-f]{32}$/.test(id)) {
    throw new DocumentStoreError('SaitoSign document id is invalid.', 'invalid');
  }
  return id;
}

function requireId(documentId) {
  const id = normalizeId(documentId);
  if (!id) {
    throw new DocumentStoreError('SaitoSign document id is missing.', 'invalid');
  }
  return id;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function bind(record) {
  return {
    $document_id: record.document_id,
    $document_hash: record.document_hash,
    $document_data: record.document_data,
    $created_at: record.created_at,
    $updated_at: record.updated_at,
    $accessed_at: record.accessed_at,
    $tier: record.tier,
    $is_paid: record.is_paid ? 1 : 0,
    $is_encrypted: record.is_encrypted ? 1 : 0,
    $expires_at: record.expires_at
  };
}

function assertIntact(row) {
  if (sha256(String(row.document_data)) !== String(row.document_hash)) {
    throw new DocumentStoreError('SaitoSign document hash does not match its payload.', 'integrity');
  }
}

function present(row, now) {
  assertIntact(row);
  const result = metadata(row, now);
  result.document_data = String(row.document_data);
  if (result.is_encrypted) {
    result.document = null;
    return result;
  }
  try {
    result.document = JSON.parse(result.document_data);
  } catch (err) {
    throw new DocumentStoreError('SaitoSign document payload could not be read.', 'integrity');
  }
  return result;
}

function metadata(row, now) {
  const expiresAt = row.expires_at == null ? null : Number(row.expires_at);
  return {
    document_id: String(row.document_id),
    document_hash: String(row.document_hash),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    accessed_at: Number(row.accessed_at),
    tier: row.tier === 'premium' ? 'premium' : 'free',
    is_paid: Number(row.is_paid) === 1,
    is_encrypted: Number(row.is_encrypted) === 1,
    expires_at: expiresAt,
    expired: expiresAt != null && expiresAt <= now
  };
}

function isUniqueViolation(err) {
  return /UNIQUE constraint failed/i.test(String(err?.message || ''));
}

function storageError(err) {
  if (err instanceof DocumentStoreError) {
    return err;
  }
  return new DocumentStoreError('SaitoSign document storage failed.', 'storage');
}

module.exports = SaitoSignDatabase;
module.exports.DocumentStoreError = DocumentStoreError;
module.exports.DEFAULT_RETENTION_MS = DEFAULT_RETENTION_MS;
