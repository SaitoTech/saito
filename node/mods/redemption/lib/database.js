const { ACTIVE_STATUSES, duplicateResult } = require('./transactions');

class Database {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  get dbname() {
    return this.mod.dbname || this.mod.returnSlug();
  }

  async connection() {
    return this.app.storage.returnDatabaseByName(this.dbname);
  }

  schemaSql() {
    const fs = this.app.storage.returnFileSystem();
    return fs.readFileSync(`${__dirname}/../sql/requests.sql`, 'utf8');
  }

  async ensureSchema() {
    const db = await this.connection();
    if (!db) {
      throw new Error('redemption database unavailable');
    }
    await db.exec(this.schemaSql());
    try {
      await db.exec(`ALTER TABLE redemption_requests ADD COLUMN collateral_id TEXT NOT NULL DEFAULT ''`);
    } catch (err) {
      // The column is already present.
    }
    return db;
  }

  async latestForNft(nftId) {
    const db = await this.connection();
    if (!db || !nftId) {
      return null;
    }
    return db.get(
      `SELECT * FROM redemption_requests WHERE nft_id = $nft_id ORDER BY id DESC LIMIT 1`,
      { $nft_id: nftId }
    );
  }

  async activeForNft(nftId) {
    const db = await this.connection();
    if (!db || !nftId) {
      return null;
    }
    return db.get(
      `SELECT * FROM redemption_requests
        WHERE nft_id = $nft_id AND status IN ('new', 'pending', 'processed')
        ORDER BY id DESC LIMIT 1`,
      { $nft_id: nftId }
    );
  }

  async statusForNfts(nftIds = []) {
    const ids = [...new Set((nftIds || []).filter(Boolean))];
    const found = {};
    for (const nftId of ids) {
      const row = await this.latestForNft(nftId);
      found[nftId] = row?.status || '';
    }
    return found;
  }

  /**
   * Insert a pending request only when this NFT has no new, pending, or
   * processed row. The unique index is the backstop for concurrent callers.
   */
  async recordPending(row) {
    const db = await this.ensureSchema();
    const now = Date.now();
    await db.exec('BEGIN IMMEDIATE');
    try {
      const existing = await db.get(
        `SELECT * FROM redemption_requests
          WHERE nft_id = $nft_id AND status IN ('new', 'pending', 'processed')
          ORDER BY id DESC LIMIT 1`,
        { $nft_id: row.nft_id }
      );
      const duplicate = duplicateResult(existing);
      if (duplicate) {
        await db.exec('COMMIT');
        return { ...duplicate, row: existing };
      }

      const inserted = await db.run(
        `INSERT INTO redemption_requests (
          nft_id, nft_type, custody_utxo, tx_sig, requester, ticker, amount,
          server_publickey, blocks_required, collateral_id, custody_block_id, tip_block_id,
          withdrawal_address, instructions, status, reason, created_at, updated_at
        ) VALUES (
          $nft_id, $nft_type, $custody_utxo, $tx_sig, $requester, $ticker, $amount,
          $server_publickey, $blocks_required, $collateral_id, $custody_block_id, $tip_block_id,
          $withdrawal_address, $instructions, 'pending', '', $created_at, $updated_at
        )`,
        {
          $nft_id: row.nft_id,
          $nft_type: row.nft_type || '',
          $custody_utxo: row.custody_utxo || '',
          $tx_sig: row.tx_sig || '',
          $requester: row.requester || '',
          $ticker: row.ticker || '',
          $amount: row.amount || '',
          $server_publickey: row.server_publickey || '',
          $blocks_required: row.blocks_required || '0',
          $collateral_id: row.collateral_id || '',
          $custody_block_id: row.custody_block_id || '',
          $tip_block_id: row.tip_block_id || '',
          $withdrawal_address: row.withdrawal_address || '',
          $instructions: row.instructions || '',
          $created_at: now,
          $updated_at: now
        }
      );
      await db.exec('COMMIT');
      return { result: 'pending', id: inserted?.lastID || 0 };
    } catch (err) {
      try {
        await db.exec('ROLLBACK');
      } catch (rollbackErr) {
        // The original error is the one to report.
      }
      if (String(err?.message || err).includes('UNIQUE')) {
        const existing = await this.activeForNft(row.nft_id);
        return { ...(duplicateResult(existing) || { result: 'duplicate', status: 'pending' }), row: existing };
      }
      throw err;
    }
  }

  async recordTerminal(row, status) {
    if (ACTIVE_STATUSES.includes(status)) {
      throw new Error('terminal redemption status expected');
    }
    const db = await this.ensureSchema();
    const now = Date.now();
    await db.run(
      `INSERT INTO redemption_requests (
        nft_id, nft_type, custody_utxo, tx_sig, requester, ticker, amount,
        server_publickey, blocks_required, collateral_id, custody_block_id, tip_block_id,
        withdrawal_address, instructions, status, reason, created_at, updated_at
      ) VALUES (
        $nft_id, $nft_type, $custody_utxo, $tx_sig, $requester, $ticker, $amount,
        $server_publickey, $blocks_required, $collateral_id, $custody_block_id, $tip_block_id,
        $withdrawal_address, $instructions, $status, $reason, $created_at, $updated_at
      )`,
      {
        $nft_id: row.nft_id,
        $nft_type: row.nft_type || '',
        $custody_utxo: row.custody_utxo || '',
        $tx_sig: row.tx_sig || '',
        $requester: row.requester || '',
        $ticker: row.ticker || '',
        $amount: row.amount || '',
        $server_publickey: row.server_publickey || '',
        $blocks_required: row.blocks_required || '0',
        $collateral_id: row.collateral_id || '',
        $custody_block_id: row.custody_block_id || '',
        $tip_block_id: row.tip_block_id || '',
        $withdrawal_address: row.withdrawal_address || '',
        $instructions: row.instructions || '',
        $status: status,
        $reason: row.reason || '',
        $created_at: now,
        $updated_at: now
      }
    );
  }
}

module.exports = Database;
