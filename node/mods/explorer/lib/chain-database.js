// Shared by the live Explorer and the offline archive importer. This is an
// observation index, not consensus state. NULL chain status means unknown.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS explorer_chain_blocks (
    hash TEXT PRIMARY KEY, height INTEGER NOT NULL, parent_hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL, creator TEXT NOT NULL,
    tx_count INTEGER, size_bytes INTEGER, in_longest_chain INTEGER,
    file_path TEXT, body_available INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS explorer_chain_height ON explorer_chain_blocks(height, hash)`,
  `CREATE INDEX IF NOT EXISTS explorer_chain_parent ON explorer_chain_blocks(parent_hash)`,
  `CREATE TABLE IF NOT EXISTS explorer_chain_files (
    path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime REAL NOT NULL
  )`
];

class ChainDatabase {
  constructor(db) {
    this.db = db;
  }

  async initialize() {
    for (const sql of SCHEMA) await this.db.run(sql);
  }

  async put(block) {
    await this.db.run(
      `INSERT INTO explorer_chain_blocks
      (hash, height, parent_hash, timestamp, creator, tx_count, size_bytes,
       in_longest_chain, file_path, body_available)
      VALUES ($hash, $height, $parent_hash, $timestamp, $creator, $tx_count,
        $size_bytes, $in_longest_chain, $file_path, $body_available)
      ON CONFLICT(hash) DO UPDATE SET
        tx_count = COALESCE(excluded.tx_count, tx_count),
        size_bytes = COALESCE(excluded.size_bytes, size_bytes),
        in_longest_chain = COALESCE(excluded.in_longest_chain, in_longest_chain),
        file_path = COALESCE(excluded.file_path, file_path),
        body_available = CASE WHEN excluded.file_path IS NULL THEN body_available
          ELSE excluded.body_available END`,
      {
        $hash: block.hash,
        $height: block.height,
        $parent_hash: block.parent_hash,
        $timestamp: block.timestamp,
        $creator: block.creator,
        $tx_count: block.tx_count ?? null,
        $size_bytes: block.size_bytes ?? null,
        $in_longest_chain: block.in_longest_chain ?? null,
        $file_path: block.file_path ?? null,
        $body_available: block.body_available ? 1 : 0
      }
    );
    if (block.in_longest_chain === 1) await this.status(block.hash, true);
  }

  async get(hash) {
    return this.db.get('SELECT * FROM explorer_chain_blocks WHERE hash = ?', hash);
  }

  async getAtHeight(height) {
    return this.db.get(
      `SELECT * FROM explorer_chain_blocks WHERE height = ?
       ORDER BY in_longest_chain DESC, hash LIMIT 1`,
      height
    );
  }

  async range(from, to, afterHeight = 0, afterHash = '', limit = 501) {
    return this.db.all(
      `SELECT * FROM explorer_chain_blocks
      WHERE height BETWEEN ? AND ? AND (height > ? OR (height = ? AND hash > ?))
      ORDER BY height, hash LIMIT ?`,
      from,
      to,
      afterHeight,
      afterHeight,
      afterHash,
      limit
    );
  }

  async bounds() {
    return this.db.get(
      'SELECT MIN(height) AS oldest, MAX(height) AS newest FROM explorer_chain_blocks'
    );
  }

  async status(hash, lc) {
    if (lc) {
      await this.db.run(
        `UPDATE explorer_chain_blocks SET in_longest_chain = CASE WHEN hash = ? THEN 1 ELSE 0 END
         WHERE height = (SELECT height FROM explorer_chain_blocks WHERE hash = ?)`,
        hash,
        hash
      );
      return;
    }
    await this.db.run(
      'UPDATE explorer_chain_blocks SET in_longest_chain = ? WHERE hash = ?',
      lc ? 1 : 0,
      hash
    );
  }

  async reconcileAncestors(from, to) {
    // Trace only known canonical ancestry, within the requested window. Never
    // infer a winning branch from height or from an archive file's presence.
    await this.db.run(
      `WITH RECURSIVE ancestors(hash, parent_hash, height) AS (
      SELECT hash, parent_hash, height FROM explorer_chain_blocks
        WHERE in_longest_chain = 1 AND height BETWEEN ? AND ?
      UNION
      SELECT b.hash, b.parent_hash, b.height FROM explorer_chain_blocks b
        JOIN ancestors a ON b.hash = a.parent_hash AND b.height = a.height - 1
        WHERE b.height >= ?
    ) UPDATE explorer_chain_blocks SET in_longest_chain = 1
      WHERE hash IN (SELECT hash FROM ancestors)`,
      from,
      to + 1,
      from
    );
    await this.db.run(
      `UPDATE explorer_chain_blocks SET in_longest_chain = 0
      WHERE height BETWEEN ? AND ? AND in_longest_chain IS NULL
      AND height IN (SELECT height FROM explorer_chain_blocks WHERE in_longest_chain = 1
        AND height BETWEEN ? AND ?)`,
      from,
      to,
      from,
      to
    );
  }

  async fileSeen(path, stat) {
    return this.db.get(
      'SELECT path FROM explorer_chain_files WHERE path = ? AND size = ? AND mtime = ?',
      path,
      stat.size,
      stat.mtimeMs
    );
  }

  async rememberFile(path, stat) {
    await this.db.run(
      'INSERT OR REPLACE INTO explorer_chain_files(path, size, mtime) VALUES (?, ?, ?)',
      path,
      stat.size,
      stat.mtimeMs
    );
  }
}

module.exports = { ChainDatabase, SCHEMA };
