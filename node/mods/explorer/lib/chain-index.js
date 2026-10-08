const fs = require('fs');
const path = require('path');
const { ChainDatabase } = require('./chain-database');
const { readBlockMetadata, blockFiles, BLOCK_NAME } = require('./chain-files');

const HASH = /^[a-f0-9]{64}$/i;

function height(value) {
  if (!/^\d+$/.test(String(value))) throw new Error('Invalid block height');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new Error('Invalid block height');
  return result;
}

class ChainIndex {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.directory = path.join(app.storage.data_dir, 'blocks');
    this.hashBytes = (bytes) => Buffer.from(app.crypto.hash(bytes), 'hex');
    this.scan = null;
    this.scanBusy = null;
    this.scanned = 0;
    this.scanErrors = 0;
    this.scanComplete = false;
    this.scanFinishedAt = 0;
    this.rangeJobs = new Map();
    this.revision = 0;
  }

  async initialize() {
    // Use the module's existing SQLite connection, so schema upgrades also run
    // on already-installed Explorers. No reset or initial full scan required.
    this.database = new ChainDatabase(await this.app.storage.returnDatabaseByName(this.mod.dbname));
    await this.database.db.exec('PRAGMA busy_timeout = 5000');
    await this.database.initialize();
  }

  async observe(block, lc = null) {
    const id = height(block.id);
    const hash = String(block.hash);
    if (!HASH.test(hash)) throw new Error('Invalid block hash');
    const existing = await this.database.get(hash);
    const record = {
      hash,
      height: id,
      parent_hash: String(block.previousBlockHash),
      timestamp: Number(block.timestamp),
      creator: String(block.creator || block.instance?.creator || ''),
      in_longest_chain: lc == null ? null : lc ? 1 : 0
    };
    if (!existing?.size_bytes || !existing?.body_available) {
      const name = String(block.file_name || '');
      if (BLOCK_NAME.test(name) && path.basename(name) === name) {
        try {
          Object.assign(
            record,
            await readBlockMetadata(path.join(this.directory, name), this.hashBytes)
          );
          record.in_longest_chain = lc == null ? null : lc ? 1 : 0;
        } catch (err) {
          if (err.code !== 'ENOENT') console.warn('Explorer chain metadata:', err.message);
        }
      }
    }
    await this.database.put(record);
    return this.database.get(hash);
  }

  async reorganize(hash, lc) {
    this.revision++;
    // Reorg callbacks may precede onNewBlock; keep the status even in that case.
    if (!(await this.database.get(hash))) {
      try {
        await this.observe(await this.app.core.blockchain.getBlock(hash, false));
      } catch (_) {}
    }
    await this.database.status(hash, lc);
  }

  async scanBatch() {
    if (this.scanBusy) return this.scanBusy;
    if (this.scanComplete && Date.now() - this.scanFinishedAt < 60000) return;
    this.scanBusy = this.scanNextFiles();
    try {
      await this.scanBusy;
    } finally {
      this.scanBusy = null;
    }
  }

  async scanNextFiles() {
    if (!this.scan) {
      this.scan = blockFiles(this.directory);
      this.scanComplete = false;
      this.scanned = 0;
      this.scanErrors = 0;
    }
    const start = Date.now();
    try {
      for (let i = 0; i < 64 && Date.now() - start < 150; i++) {
        const next = await this.scan.next();
        if (next.done) {
          this.scan = null;
          this.scanComplete = true;
          this.scanFinishedAt = Date.now();
          break;
        }
        const filename = next.value;
        this.scanned++;
        try {
          const stat = await fs.promises.stat(filename);
          if (await this.database.fileSeen(filename, stat)) continue;
          await this.database.put(await readBlockMetadata(filename, this.hashBytes));
          await this.database.rememberFile(filename, stat);
        } catch (err) {
          if (err.code?.startsWith('SQLITE')) throw err;
          this.scanErrors++;
          console.warn('Explorer chain scan:', filename, err.message);
        }
      }
    } catch (err) {
      await this.scan?.return();
      this.scan = null;
      console.warn('Explorer chain scan failed:', err.message);
      throw new Error('Unable to index local block files');
    }
  }

  async resolve(identifier) {
    if (identifier && HASH.test(String(identifier))) {
      const hash = String(identifier).toLowerCase();
      try {
        const block = await this.app.core.blockchain.getBlock(hash, false);
        return await this.observe(block, block.inLongestChain);
      } catch (_) {
        return this.database.get(hash);
      }
    }
    const id = height(identifier);
    try {
      const block = await this.app.core.blockchain.getBlock(BigInt(id), false);
      return await this.observe(block, block.inLongestChain);
    } catch (_) {
      return this.database.getAtHeight(id);
    }
  }

  async range(params = {}) {
    // Validate before doing disk or core work. Continue within a height when a
    // response hits the row limit; siblings can never silently disappear.
    let from = params.from == null ? null : height(params.from);
    let to = params.to == null ? null : height(params.to);
    if ((from == null) !== (to == null) || (from != null && (to < from || to - from > 49))) {
      throw new Error('Request at most 50 consecutive heights');
    }
    const afterHeight = params.after_height == null ? 0 : height(params.after_height);
    const afterHash = params.after_hash || '';
    if (afterHash && !HASH.test(afterHash)) throw new Error('Invalid continuation hash');
    if (params.anchor && !HASH.test(String(params.anchor))) height(params.anchor);
    const key = JSON.stringify([from, to, params.anchor, afterHeight, afterHash]);
    if (this.rangeJobs.has(key)) return this.rangeJobs.get(key);
    if (this.rangeJobs.size >= 2) throw new Error('Chain viewer is busy; retry shortly');
    const job = this.loadRange({ from, to, anchor: params.anchor, afterHeight, afterHash });
    this.rangeJobs.set(key, job);
    try {
      return await job;
    } finally {
      this.rangeJobs.delete(key);
    }
  }

  async loadRange({ from, to, anchor, afterHeight, afterHash }) {
    const chain = this.app.core.blockchain;
    let tip = null;
    try {
      tip = (await chain.getBlocks(1, false))[0];
    } catch (_) {}
    let center;
    if (from == null && anchor) center = await this.resolve(anchor);
    let diskError = null;
    if (!afterHeight) {
      try {
        await this.scanBatch();
      } catch (err) {
        diskError = err.message;
      }
    }
    if (from == null && anchor && !center) center = await this.resolve(anchor);
    const bounds = await this.database.bounds();
    if (from == null) {
      if (anchor && !center) {
        return {
          blocks: [],
          pending_anchor: !this.scanComplete,
          anchor_missing: this.scanComplete,
          indexing: !this.scanComplete,
          scanned_files: this.scanned,
          disk_error: diskError
        };
      }
      const id = height(center?.height || tip?.id || bounds.newest || 1);
      from = Math.max(1, id - 24);
      to = Math.min(Number.MAX_SAFE_INTEGER, from + 49);
    }
    for (let id = from; !afterHeight && id <= to; id++) {
      let hashes = [];
      try {
        hashes = await chain.getHashesAtId(BigInt(id));
      } catch (_) {}
      for (const hash of hashes) {
        try {
          const block = await chain.getBlock(String(hash), false);
          await this.observe(block, block.inLongestChain);
        } catch (err) {
          console.warn('Explorer chain observation:', err.message);
        }
      }
    }
    await this.database.reconcileAncestors(from, to);
    const rows = await this.database.range(from, to, afterHeight, afterHash);
    const more = rows.length > 500;
    const page = rows.slice(0, 500);
    const last = page[page.length - 1];
    return {
      blocks: page.map(({ file_path, ...row }) => row),
      from,
      to,
      center: center?.height ?? null,
      selected_hash: center?.hash ?? null,
      tip_height: tip ? Number(tip.id) : bounds.newest,
      tip_hash: tip ? String(tip.hash) : null,
      revision: this.revision,
      oldest_indexed: bounds.oldest,
      indexing: !this.scanComplete,
      scanned_files: this.scanned,
      scan_errors: this.scanErrors,
      disk_error: diskError,
      continuation: more ? { after_height: last.height, after_hash: last.hash } : null
    };
  }

  async loadStoredBlock(identifier, includeTransactions) {
    const row = await this.resolve(identifier);
    if (!row) return null;
    if (includeTransactions && row.file_path) {
      const block = await this.app.storage.loadBlockByFilename(row.file_path);
      if (block && String(block.hash) === row.hash) return { block, row };
      await this.database.db.run(
        'UPDATE explorer_chain_blocks SET body_available = 0 WHERE hash = ?',
        row.hash
      );
    }
    return { row };
  }
}

module.exports = { ChainIndex, height };
