const fs = require('fs');
const path = require('path');

// The admin payment test writes this exact hash onto many transfers.
// It is not a Mixin transaction hash. The unique index excludes only this value.
const SYNTHETIC_INBOUND_TX_HASH = 'admin-test';
const INBOUND_HASH_INDEX = 'transfers_inbound_tx_hash_uidx';
const transactionTails = new WeakMap();

function isRealInboundHash(hash) {
  const value = String(hash || '').trim();
  return value !== '' && value !== SYNTHETIC_INBOUND_TX_HASH;
}

function isInboundHashConflict(err) {
  const message = String(err?.message || err || '');
  return (
    err?.code === 'SQLITE_CONSTRAINT' ||
    /UNIQUE constraint failed/i.test(message) ||
    message.includes(INBOUND_HASH_INDEX)
  );
}

function splitTransfersSql(sql) {
  const marker = '-- inbound-payment-uniqueness';
  const at = String(sql || '').indexOf(marker);
  if (at < 0) {
    return { tableSql: sql, indexSql: '' };
  }
  return {
    tableSql: sql.slice(0, at),
    indexSql: sql.slice(at).replace(/^--.*$/gm, '').trim()
  };
}

const TRANSFER_FIELDS = [
  'purpose',
  'mode',
  'payload',
  'email',
  'request_id',
  'requester_publickey',
  'recipient_publickey',
  'status',
  'inbound_ticker',
  'inbound_asset_id',
  'inbound_chain_id',
  'inbound_amount',
  'inbound_address',
  'inbound_sender',
  'inbound_mixin_user_id',
  'inbound_confirmations',
  'inbound_confirmations_required',
  'inbound_tx',
  'inbound_tx_sig',
  'inbound_tx_hash',
  'inbound_tx_id',
  'inbound_received_at',
  'inbound_block_id',
  'inbound_block_hash',
  'inbound_longest_chain',
  'inbound_confirmation_block_id',
  'outbound_ticker',
  'outbound_asset_id',
  'outbound_chain_id',
  'outbound_amount',
  'outbound_address',
  'outbound_sender',
  'outbound_mixin_user_id',
  'outbound_confirmations_required',
  'outbound_tx',
  'outbound_tx_sig',
  'outbound_tx_hash',
  'outbound_tx_id',
  'outbound_sent_at',
  'outbound_block_id',
  'outbound_block_hash',
  'outbound_confirmation_block_id',
  'last_error',
  'excluded',
  'created_at',
  'updated_at'
];

class Database {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  dbname() {
    return this.mod.dbname || this.mod.slug || 'mixin';
  }

  async query(sql, params) {
    return this.app.storage.queryDatabase(sql, params, this.dbname());
  }

  async run(sql, params) {
    return this.app.storage.runDatabase(sql, params, this.dbname());
  }

  async saveCredentials(publicKey, ciphertext, userId = null) {
    if (userId) {
      await this.run(
        `INSERT INTO accounts (publickey, user_id, ciphertext, created_at)
         VALUES ($publickey, $user_id, $ciphertext, $created_at)
         ON CONFLICT(publickey, user_id) DO UPDATE SET ciphertext = excluded.ciphertext`,
        {
          $publickey: publicKey,
          $user_id: userId,
          $ciphertext: ciphertext,
          $created_at: Date.now()
        }
      );
      return;
    }

    const rows = await this.getCredentials(publicKey);
    if (rows.length) {
      await this.run(`UPDATE accounts SET ciphertext = $ciphertext WHERE id = $id`, {
        $ciphertext: ciphertext,
        $id: rows[0].id
      });
      return;
    }

    await this.run(
      `INSERT INTO accounts (publickey, user_id, ciphertext, created_at)
       VALUES ($publickey, '', $ciphertext, $created_at)`,
      {
        $publickey: publicKey,
        $ciphertext: ciphertext,
        $created_at: Date.now()
      }
    );
  }

  async getCredentials(publicKey, userId = null) {
    if (userId) {
      const rows = await this.query(
        `SELECT ciphertext FROM accounts WHERE publickey = $publickey AND user_id = $user_id`,
        { $publickey: publicKey, $user_id: userId }
      );
      return rows[0]?.ciphertext || null;
    }

    return this.query(
      `SELECT id, user_id, ciphertext, created_at
       FROM accounts
       WHERE publickey = $publickey
       ORDER BY created_at ASC, id ASC`,
      { $publickey: publicKey }
    );
  }

  async insertAddress({ mixinUserId, publicKey, assetId, address, createdAt }) {
    await this.run(
      `INSERT INTO addresses (mixin_user_id, publickey, asset_id, address, created_at)
       VALUES ($mixin_user_id, $publickey, $asset_id, $address, $created_at)
       ON CONFLICT(mixin_user_id, asset_id) DO UPDATE SET
         publickey = excluded.publickey,
         address = excluded.address`,
      {
        $mixin_user_id: mixinUserId,
        $publickey: publicKey || '',
        $asset_id: assetId,
        $address: address,
        $created_at: createdAt || Date.now()
      }
    );
  }

  async listAddresses(publicKey = '') {
    const key = String(publicKey || '');
    if (!key) {
      return [];
    }
    return this.query(
      `SELECT id, mixin_user_id, publickey, asset_id, address, created_at
       FROM addresses
       WHERE publickey = $publickey
       ORDER BY created_at ASC, id ASC`,
      { $publickey: key }
    );
  }

  async listReservedInboundAddresses() {
    const rows = await this.query(
      `SELECT DISTINCT inbound_address
       FROM transfers
       WHERE excluded = 0
         AND inbound_address <> ''
         AND status IN (
           'inbound_awaiting',
           'inbound_broadcast',
           'inbound_confirmed',
           'outbound_awaiting',
           'outbound_broadcast',
           'treasury_submitted',
           'treasury_accepted'
         )`,
      {}
    );
    return (rows || []).map((row) => row.inbound_address).filter(Boolean);
  }

  async findAddress({ assetId, mixinUserId, publicKey, address } = {}) {
    if (!assetId) {
      return null;
    }

    const filters = ['asset_id = $asset_id'];
    const params = { $asset_id: assetId };

    if (mixinUserId) {
      filters.push('mixin_user_id = $mixin_user_id');
      params.$mixin_user_id = mixinUserId;
    }
    if (publicKey) {
      filters.push('publickey = $publickey');
      params.$publickey = publicKey;
    }
    if (address) {
      filters.push('address = $address');
      params.$address = address;
    }

    if (filters.length === 1) {
      return null;
    }

    const rows = await this.query(
      `SELECT * FROM addresses WHERE ${filters.join(' AND ')} ORDER BY created_at DESC LIMIT 1`,
      params
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      user_id: row.mixin_user_id,
      address: row.address,
      publickey: row.publickey,
      asset_id: row.asset_id
    };
  }

  async copyLegacyTables() {
    const accounts = await this.query(
      `SELECT publickey, account_hash
       FROM mixin_accounts
       WHERE id IN (SELECT MAX(id) FROM mixin_accounts GROUP BY publickey)`,
      {}
    );

    for (const row of accounts) {
      if (!row?.publickey || !row.account_hash) {
        continue;
      }
      const existing = await this.getCredentials(row.publickey);
      if (!existing?.length) {
        await this.saveCredentials(row.publickey, row.account_hash);
      }
    }

    const users = await this.query(
      `SELECT user_id, address, publickey, asset_id, created_at
       FROM mixin_users
       ORDER BY created_at DESC`,
      {}
    );

    for (const row of users) {
      if (!row?.user_id || !row.asset_id || !row.address) {
        continue;
      }
      const existing = await this.findAddress({
        assetId: row.asset_id,
        mixinUserId: row.user_id
      });
      if (existing) {
        continue;
      }
      await this.insertAddress({
        mixinUserId: row.user_id,
        publicKey: row.publickey,
        assetId: row.asset_id,
        address: row.address,
        createdAt: row.created_at
      });
    }
  }

  async ensureAccountsSchema() {
    const columns = await this.query(`PRAGMA table_info(accounts)`, {});
    if (!columns?.length) {
      return;
    }
    if (columns.some((column) => column.name === 'user_id')) {
      await this.run(
        `CREATE UNIQUE INDEX IF NOT EXISTS accounts_publickey_user_uidx
         ON accounts (publickey, user_id)`,
        {}
      );
      return;
    }

    await this.run(`ALTER TABLE accounts RENAME TO accounts_legacy`, {});
    await this.run(
      `CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        publickey TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '',
        ciphertext TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT 0
      )`,
      {}
    );
    await this.run(
      `INSERT INTO accounts (id, publickey, user_id, ciphertext, created_at)
       SELECT id, publickey, '', ciphertext, created_at FROM accounts_legacy`,
      {}
    );
    await this.run(`DROP TABLE accounts_legacy`, {});
    await this.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS accounts_publickey_user_uidx
       ON accounts (publickey, user_id)`,
      {}
    );
  }

  async ensureTransfersSchema() {
    const columns = await this.query(`PRAGMA table_info(transfers)`, {});
    if (!columns?.length) {
      return;
    }

    const defined = await this.query(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transfers'`,
      {}
    );
    const definedSql = String(defined[0]?.sql || '');
    if (!definedSql.includes("'inbound_awaiting'") || !definedSql.includes("'treasury_submitted'")) {
      await this.run(`ALTER TABLE transfers RENAME TO transfers_legacy`, {});
      const sql = fs.readFileSync(path.join(__dirname, '../sql/transfers.sql'), 'utf8');
      const tableSql = splitTransfersSql(sql).tableSql;
      if (this.app.storage.executeDatabase) {
        await this.app.storage.executeDatabase(tableSql, this.dbname());
      } else {
        await this.run(tableSql, {});
      }

      const legacyColumns = new Set(
        (await this.query(`PRAGMA table_info(transfers_legacy)`, {})).map((column) => column.name)
      );
      const freshColumns = (await this.query(`PRAGMA table_info(transfers)`, {})).map(
        (column) => column.name
      );
      const shared = freshColumns.filter((name) => name !== 'status' && legacyColumns.has(name));
      if (shared.length) {
        await this.run(
          `INSERT INTO transfers (status, ${shared.join(', ')})
           SELECT CASE status
             WHEN 'awaiting_inbound' THEN 'inbound_awaiting'
             WHEN 'inbound_pending' THEN 'inbound_broadcast'
             WHEN 'inbound_observed' THEN 'inbound_broadcast'
             WHEN 'awaiting_outbound' THEN 'outbound_awaiting'
             WHEN 'outbound_pending' THEN 'outbound_broadcast'
             WHEN 'outbound_sent' THEN 'outbound_broadcast'
             WHEN 'outbound_observed' THEN 'outbound_broadcast'
             ELSE status
           END, ${shared.join(', ')}
           FROM transfers_legacy`,
          {}
        );
      }
      await this.run(`DROP TABLE transfers_legacy`, {});
      await this.ensureInboundPaymentUniqueness();
      await this.ensureStoreWithdrawalClaims();
      await this.ensureTreasurySchema();
      return;
    }

    const present = new Set(columns.map((column) => column.name));
    const additions = [
      ['request_id', `TEXT NOT NULL DEFAULT ''`],
      ['requester_publickey', `TEXT NOT NULL DEFAULT ''`],
      ['recipient_publickey', `TEXT NOT NULL DEFAULT ''`],
      ['inbound_confirmations', 'INTEGER NOT NULL DEFAULT 0'],
      ['inbound_confirmations_required', 'INTEGER NOT NULL DEFAULT 0'],
      ['outbound_confirmations_required', 'INTEGER NOT NULL DEFAULT 0'],
      ['inbound_tx_hash', `TEXT NOT NULL DEFAULT ''`],
      ['inbound_tx_id', `TEXT NOT NULL DEFAULT ''`],
      ['outbound_tx_id', `TEXT NOT NULL DEFAULT ''`],
      ['inbound_confirmation_block_id', 'INTEGER'],
      ['outbound_confirmation_block_id', 'INTEGER'],
      ['mode', `TEXT NOT NULL DEFAULT 'automatic' CHECK (mode IN ('automatic', 'manual'))`],
      ['excluded', 'INTEGER NOT NULL DEFAULT 0']
    ];
    for (const [name, definition] of additions) {
      if (!present.has(name)) {
        await this.run(`ALTER TABLE transfers ADD COLUMN ${name} ${definition}`, {});
      }
    }
    await this.ensureInboundPaymentUniqueness();
    await this.ensureStoreWithdrawalClaims();
    await this.ensureTreasurySchema();
  }

  async ensureTreasurySchema() {
    const db = await this.app.storage.returnDatabaseByName?.(this.dbname());
    if (!db?.exec) {
      return;
    }
    const sql = fs.readFileSync(path.join(__dirname, '../sql/treasury.sql'), 'utf8');
    await db.exec(sql);
    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS transfers_treasury_request_uidx
        ON transfers (request_id)
        WHERE purpose = 'treasury-payout' AND request_id <> '';
    `);
  }

  async ensureStoreWithdrawalClaims() {
    const db = await this.app.storage.returnDatabaseByName(this.dbname());
    if (!db) {
      return;
    }
    await db.exec(`
      CREATE TABLE IF NOT EXISTS store_withdrawal_claims (
        transfer_uuid TEXT PRIMARY KEY,
        payment_uuid TEXT NOT NULL UNIQUE,
        request_id TEXT NOT NULL,
        withdrawal_transfer_id INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS store_withdrawal_request_uidx
        ON transfers (request_id)
        WHERE purpose = 'store-withdrawal' AND request_id <> '';
    `);
  }

  async withImmediateTransaction(fn) {
    const db = await this.app.storage.returnDatabaseByName(this.dbname());
    if (!db) {
      throw new Error('Mixin database unavailable');
    }
    const previous = transactionTails.get(db) || Promise.resolve();
    const operation = previous.then(async () => {
      await db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(db);
        await db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          await db.exec('ROLLBACK');
        } catch (rollbackError) {
          console.error('Mixin Database: rollback failed', rollbackError);
        }
        throw err;
      }
    });
    transactionTails.set(
      db,
      operation.then(
        () => undefined,
        () => undefined
      )
    );
    return operation;
  }

  async recordStoreWithdrawal(record) {
    await this.ensureStoreWithdrawalClaims();
    return this.withImmediateTransaction(async (db) => {
      const existing = await db.all(
        `SELECT id, purpose, mode, payload
         FROM transfers
         WHERE purpose = 'store-withdrawal' AND request_id = $request
         LIMIT 1`,
        { $request: record.request_id }
      );
      if (existing?.length) {
        return { transfer_id: existing[0].id, replayed: true };
      }

      const { decimalUnits } = require('./store-withdrawal');
      let backing = 0n;
      const requested = decimalUnits(record.withdrawal_amount);
      if (requested == null) {
        throw new Error('The withdrawal amount is not valid.');
      }
      for (const pair of record.pairs) {
        const source = await db.all(
          `SELECT id, purpose, inbound_tx_hash, inbound_ticker, inbound_amount, inbound_asset_id
           FROM transfers
           WHERE id = $id`,
          { $id: Number(pair.transfer) }
        );
        const row = source?.[0];
        if (
          !row ||
          row.purpose !== 'store-purchase' ||
          String(row.inbound_tx_hash || '') !== pair.payment
        ) {
          throw new Error('A referenced transfer or payment was not found.');
        }
        if (String(row.inbound_ticker || '').trim().toUpperCase() !== String(record.ticker || '').trim()) {
          throw new Error('A referenced payment is for a different cryptocurrency.');
        }
        const units = decimalUnits(row.inbound_amount);
        if (units == null) {
          throw new Error('A referenced payment amount is not valid.');
        }
        backing += units;
        const claimed = await db.all(
          `SELECT request_id FROM store_withdrawal_claims
           WHERE transfer_uuid = $transfer OR payment_uuid = $payment
           LIMIT 1`,
          { $transfer: pair.transfer, $payment: pair.payment }
        );
        if (claimed?.length) {
          throw new Error('Those proceeds are already reserved for a withdrawal.');
        }
      }
      if (backing !== requested) {
        throw new Error('The withdrawal amount does not match the unspent proceeds.');
      }

      const now = Date.now();
      const inserted = await db.run(
        `INSERT INTO transfers (
           purpose, mode, payload, request_id, requester_publickey, recipient_publickey,
           status, inbound_ticker, inbound_amount, inbound_sender, inbound_tx, inbound_tx_sig,
           outbound_ticker, outbound_amount, outbound_address, outbound_sender,
           created_at, updated_at
         ) VALUES (
           'store-withdrawal', 'manual', $payload, $request_id, $requester, $requester,
           'other', 'SAITO', $inbound_amount, $inbound_sender, $inbound_tx, $inbound_tx_sig,
           $outbound_ticker, $outbound_amount, $outbound_address, $outbound_sender,
           $now, $now
         )`,
        {
          $payload: record.payload,
          $request_id: record.request_id,
          $requester: record.sender,
          $inbound_amount: record.saito_amount,
          $inbound_sender: record.sender,
          $inbound_tx: record.saito_tx || '',
          $inbound_tx_sig: record.saito_tx_sig || '',
          $outbound_ticker: record.ticker,
          $outbound_amount: record.withdrawal_amount,
          $outbound_address: record.withdrawal_address,
          $outbound_sender: record.outbound_sender || '',
          $now: now
        }
      );
      const transferId = inserted?.lastID;
      if (!transferId) {
        throw new Error('The withdrawal transfer was not recorded.');
      }
      for (const pair of record.pairs) {
        await db.run(
          `INSERT INTO store_withdrawal_claims (
             transfer_uuid, payment_uuid, request_id, withdrawal_transfer_id
           ) VALUES ($transfer, $payment, $request, $transfer_id)`,
          {
            $transfer: pair.transfer,
            $payment: pair.payment,
            $request: record.request_id,
            $transfer_id: transferId
          }
        );
      }
      return { transfer_id: transferId, replayed: false };
    });
  }

  async listStoreWithdrawalsAwaitingInclusion() {
    return this.query(
      `SELECT * FROM transfers
       WHERE purpose = 'store-withdrawal'
         AND excluded = 0
         AND inbound_tx_sig <> ''
         AND IFNULL(inbound_block_hash, '') = ''
       ORDER BY id ASC`,
      {}
    );
  }

  async listStoreWithdrawalsInBlock(blockId, blockHash) {
    return this.query(
      `SELECT * FROM transfers
       WHERE purpose = 'store-withdrawal'
         AND excluded = 0
         AND inbound_block_id = $block_id
         AND inbound_block_hash = $block_hash
       ORDER BY id ASC`,
      { $block_id: Number(blockId) || 0, $block_hash: String(blockHash || '') }
    );
  }

  async duplicateInboundPayments() {
    const rows = await this.query(
      `SELECT inbound_tx_hash, id, purpose
       FROM transfers
       WHERE inbound_tx_hash <> ''
         AND inbound_tx_hash <> $synthetic
         AND inbound_tx_hash IN (
           SELECT inbound_tx_hash
           FROM transfers
           WHERE inbound_tx_hash <> ''
             AND inbound_tx_hash <> $synthetic
           GROUP BY inbound_tx_hash
           HAVING COUNT(*) > 1
         )
       ORDER BY inbound_tx_hash ASC, id ASC`,
      { $synthetic: SYNTHETIC_INBOUND_TX_HASH }
    );
    const grouped = new Map();
    for (const row of rows || []) {
      const hash = row.inbound_tx_hash;
      if (!grouped.has(hash)) {
        grouped.set(hash, { inbound_tx_hash: hash, transfers: [] });
      }
      grouped.get(hash).transfers.push({
        id: row.id,
        purpose: row.purpose || ''
      });
    }
    return [...grouped.values()];
  }

  /**
   * Create the real-hash unique index only when no existing row already shares
   * one. Conflicting rows are left unchanged for deliberate recovery.
   */
  async ensureInboundPaymentUniqueness() {
    const conflicts = await this.duplicateInboundPayments();
    if (conflicts.length) {
      for (const conflict of conflicts) {
        console.error(
          'Mixin inbound payment hash is already assigned to more than one transfer; uniqueness index was not created',
          {
            inbound_tx_hash: conflict.inbound_tx_hash,
            transfers: conflict.transfers
          }
        );
      }
      return { enforced: false, conflicts };
    }

    const file = fs.readFileSync(path.join(__dirname, '../sql/transfers.sql'), 'utf8');
    const indexSql = splitTransfersSql(file).indexSql;
    if (indexSql) {
      await this.run(indexSql, {});
    }
    const present = await this.query(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = $name`,
      { $name: INBOUND_HASH_INDEX }
    );
    return { enforced: (present || []).length > 0, conflicts: [] };
  }

  async claimInboundPayment(id, fields = {}) {
    const hash = String(fields.inbound_tx_hash ?? '').trim();
    const next = { ...fields, inbound_tx_hash: hash };
    if (!isRealInboundHash(hash)) {
      await this.updateTransfer(id, next);
      return { ok: true, conflict: null };
    }

    const assignments = ['updated_at = $updated_at'];
    const params = { $id: id, $owner_id: id, $updated_at: Date.now(), $claim_hash: hash };
    for (const field of TRANSFER_FIELDS) {
      if (field === 'updated_at' || next[field] === undefined) {
        continue;
      }
      assignments.push(`${field} = $${field}`);
      params[`$${field}`] = next[field];
    }
    try {
      await this.run(
        `UPDATE transfers SET ${assignments.join(', ')}
         WHERE id = $id
           AND NOT EXISTS (
             SELECT 1 FROM transfers AS claimed
             WHERE claimed.inbound_tx_hash = $claim_hash
               AND claimed.id <> $owner_id
           )`,
        params
      );
    } catch (err) {
      if (!isInboundHashConflict(err)) {
        throw err;
      }
    }

    const owners = await this.query(
      `SELECT id, purpose FROM transfers
       WHERE inbound_tx_hash = $hash AND id <> $id
       ORDER BY id ASC`,
      { $hash: hash, $id: id }
    );
    if (owners?.length) {
      const owner = owners[0];
      const attempted = await this.query(
        `SELECT id, purpose FROM transfers WHERE id = $id`,
        { $id: id }
      );
      console.error('Mixin inbound payment already claimed', {
        inbound_tx_hash: hash,
        owner_transfer_id: owner.id,
        owner_purpose: owner.purpose || '',
        attempted_transfer_id: id,
        attempted_purpose: attempted?.[0]?.purpose || ''
      });
      return {
        ok: false,
        conflict: { id: owner.id, purpose: owner.purpose || '' }
      };
    }

    const current = await this.query(
      `SELECT inbound_tx_hash FROM transfers WHERE id = $id`,
      { $id: id }
    );
    if (current?.[0] && String(current[0].inbound_tx_hash) === hash) {
      return { ok: true, conflict: null };
    }
    throw new Error(`Transfer ${id} could not record inbound payment ${hash}`);
  }

  async insertTransfer(transfer) {
    const columns = ['created_at', 'updated_at'];
    const values = ['$created_at', '$updated_at'];
    const now = Date.now();
    const params = { $created_at: transfer.created_at || now, $updated_at: now };

    for (const field of TRANSFER_FIELDS) {
      if (field === 'created_at' || field === 'updated_at') {
        continue;
      }
      if (transfer[field] === undefined) {
        continue;
      }
      columns.push(field);
      values.push(`$${field}`);
      params[`$${field}`] = transfer[field];
    }

    const result = await this.run(
      `INSERT INTO transfers (${columns.join(', ')}) VALUES (${values.join(', ')})`,
      params
    );
    return result?.lastID || null;
  }

  async updateTransfer(id, fields) {
    const assignments = ['updated_at = $updated_at'];
    const params = { $id: id, $updated_at: Date.now() };
    for (const field of TRANSFER_FIELDS) {
      if (field === 'updated_at' || fields[field] === undefined) {
        continue;
      }
      assignments.push(`${field} = $${field}`);
      params[`$${field}`] = fields[field];
    }
    await this.run(`UPDATE transfers SET ${assignments.join(', ')} WHERE id = $id`, params);
  }

  async getTransfers(criteria = {}) {
    const filters = [];
    const params = {};
    for (const field of [
      'id',
      'request_id',
      'requester_publickey',
      'recipient_publickey',
      'inbound_ticker',
      'inbound_address',
      'status',
      'purpose',
      'mode',
      'excluded'
    ]) {
      if (criteria[field] !== undefined && criteria[field] !== null) {
        filters.push(`${field} = $${field}`);
        params[`$${field}`] = criteria[field];
      }
    }
    if (!filters.length) {
      return [];
    }
    return this.query(
      `SELECT * FROM transfers WHERE ${filters.join(' AND ')} ORDER BY id ASC`,
      params
    );
  }

  async getTransfersPendingInboundBroadcast() {
    return this.query(
      `SELECT * FROM transfers
       WHERE mode = 'automatic'
         AND excluded = 0
         AND status = 'inbound_awaiting'
       ORDER BY id ASC`,
      {}
    );
  }

  async getTransfersPendingInboundConfirmed() {
    return this.query(
      `SELECT * FROM transfers
       WHERE mode = 'automatic'
         AND excluded = 0
         AND status = 'inbound_broadcast'
         AND inbound_tx_hash <> ''
         AND inbound_confirmations >= inbound_confirmations_required
       ORDER BY id ASC`,
      {}
    );
  }

  async getTransfersPendingOutboundAwaiting(currentBlockId) {
    return this.query(
      `SELECT * FROM transfers
       WHERE mode = 'automatic'
         AND excluded = 0
         AND status = 'inbound_confirmed'
         AND outbound_tx_sig = ''
         AND inbound_confirmation_block_id IS NOT NULL
         AND inbound_confirmation_block_id <= $current_block_id
       ORDER BY id ASC`,
      { $current_block_id: currentBlockId }
    );
  }

  async listAdminTransfers({ search = '', page = 1, purpose = '' } = {}) {
    const pageSize = 20;
    const term = String(search || '').trim();
    const selected = ['migration', 'buysaito'].includes(purpose) ? purpose : '';
    const params = {};
    let where = 'excluded = 0';
    if (selected) {
      where += ' AND purpose = $purpose';
      params.$purpose = selected;
    }
    if (!term) {
      where += ` AND status IN (
        'inbound_awaiting',
        'inbound_broadcast',
        'inbound_confirmed',
        'outbound_awaiting',
        'outbound_broadcast',
        'treasury_submitted',
        'treasury_accepted',
        'treasury_rejected'
      )`;
    } else {
      params.$q = term;
      const clauses = [
        'requester_publickey = $q',
        'recipient_publickey = $q',
        'publickey = $q',
        'inbound_address = $q',
        'inbound_sender = $q',
        'outbound_address = $q',
        'outbound_sender = $q'
      ];
      if (/^0x[a-fA-F0-9]{40}$/i.test(term)) {
        params.$ql = term.toLowerCase();
        clauses.push(
          'lower(inbound_address) = $ql',
          'lower(inbound_sender) = $ql',
          'lower(outbound_address) = $ql',
          'lower(outbound_sender) = $ql'
        );
      }
      where += ` AND (${clauses.join(' OR ')})`;
    }
    const counted = await this.query(`SELECT COUNT(*) AS total FROM transfers WHERE ${where}`, params);
    const total = Number(counted?.[0]?.total || 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const requested = Number(page);
    const current = Number.isInteger(requested) && requested > 0 ? Math.min(requested, pageCount) : 1;
    const rows = await this.query(
      `SELECT * FROM transfers
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $limit OFFSET $offset`,
      { ...params, $limit: pageSize, $offset: (current - 1) * pageSize }
    );
    return { rows: rows || [], total, page: current, page_size: pageSize };
  }

  async getTransfersPendingTreasurySubmission() {
    return this.query(
      `SELECT * FROM transfers
       WHERE excluded = 0
         AND status = 'treasury_submitted'
       ORDER BY id ASC`,
      {}
    );
  }

  async findLocalTreasury(sourceTransferId) {
    const rows = await this.query(
      `SELECT * FROM treasury
       WHERE origin = 'local' AND source_transfer_id = $source
       LIMIT 1`,
      { $source: Number(sourceTransferId) }
    );
    return rows?.[0] || null;
  }

  async findTreasuryByTransfer(transferId) {
    const rows = await this.query(
      `SELECT * FROM treasury
       WHERE transfer_id = $id
       ORDER BY id ASC
       LIMIT 1`,
      { $id: Number(transferId) }
    );
    return rows?.[0] || null;
  }

  async updateTreasury(id, fields) {
    const assignments = ['updated_at = $updated_at'];
    const params = { $id: id, $updated_at: Date.now() };
    for (const field of [
      'status',
      'last_error',
      'remote_transfer_id',
      'transfer_id',
      'request_tx',
      'request_tx_sig',
      'request_payload'
    ]) {
      if (fields[field] !== undefined) {
        assignments.push(`${field} = $${field}`);
        params[`$${field}`] = fields[field];
      }
    }
    await this.run(`UPDATE treasury SET ${assignments.join(', ')} WHERE id = $id`, params);
  }

  async saveLocalTreasuryRequest(record) {
    await this.ensureTreasurySchema();
    return this.withImmediateTransaction(async (db) => {
      const existing = await db.all(
        `SELECT * FROM treasury
         WHERE origin = 'local' AND source_transfer_id = $source
         LIMIT 1`,
        { $source: record.source_transfer_id }
      );
      if (existing?.length) {
        return existing[0];
      }
      const now = Date.now();
      const inserted = await db.run(
        `INSERT INTO treasury (
           origin, requester_publickey, source_transfer_id, request_tx, request_tx_sig,
           request_payload, transfer_id, status, last_error, created_at, updated_at
         ) VALUES (
           'local', $requester, $source, $tx, $sig, $payload, $transfer, 'pending', '', $now, $now
         )`,
        {
          $requester: record.requester_publickey,
          $source: record.source_transfer_id,
          $tx: record.request_tx,
          $sig: record.request_tx_sig,
          $payload: record.request_payload,
          $transfer: record.transfer_id,
          $now: now
        }
      );
      if (!inserted?.lastID) {
        throw new Error('The treasury request was not recorded.');
      }
      const saved = await db.all(`SELECT * FROM treasury WHERE id = $id`, { $id: inserted.lastID });
      return saved[0];
    });
  }

  async recordRemoteTreasuryPayout(record) {
    await this.ensureTreasurySchema();
    try {
      return await this.withImmediateTransaction(async (db) => {
        const existing = await db.all(
          `SELECT * FROM treasury
           WHERE origin = 'remote'
             AND requester_publickey = $requester
             AND source_transfer_id = $source
           LIMIT 1`,
          { $requester: record.requester_publickey, $source: record.source_transfer_id }
        );
        if (existing?.length) {
          const audit = existing[0];
          if (
            audit.request_tx_sig !== record.request_tx_sig ||
            audit.request_payload !== record.request_payload
          ) {
            return { conflict: true, treasury: audit };
          }
          const transfers = await db.all(`SELECT * FROM transfers WHERE id = $id`, {
            $id: audit.transfer_id
          });
          return { replayed: true, treasury: audit, transfer: transfers?.[0] || null };
        }

        const now = Date.now();
        const inserted = await db.run(
          `INSERT INTO transfers (
             purpose, mode, payload, request_id, requester_publickey, recipient_publickey,
             status, inbound_ticker, inbound_amount, inbound_tx_hash, inbound_confirmation_block_id,
             outbound_ticker, outbound_amount, outbound_address, excluded, created_at, updated_at
           ) VALUES (
             'treasury-payout', 'automatic', $payload, $request_id, $requester, $recipient,
             'inbound_confirmed', $inbound_ticker, $inbound_amount, $inbound_hash, 0,
             'SAITO', $outbound_amount, $outbound_address, 0, $now, $now
           )`,
          {
            $payload: record.payload || '',
            $request_id: record.request_id,
            $requester: record.requester_publickey,
            $recipient: record.recipient_publickey,
            $inbound_ticker: record.inbound_ticker || '',
            $inbound_amount: record.inbound_amount || '',
            $inbound_hash: record.inbound_tx_hash || '',
            $outbound_amount: record.outbound_amount,
            $outbound_address: record.recipient_publickey,
            $now: now
          }
        );
        const transferId = inserted?.lastID;
        if (!transferId) {
          throw new Error('The treasury transfer was not recorded.');
        }
        const auditInsert = await db.run(
          `INSERT INTO treasury (
             origin, requester_publickey, source_transfer_id, request_tx, request_tx_sig,
             request_payload, transfer_id, status, last_error, created_at, updated_at
           ) VALUES (
             'remote', $requester, $source, $tx, $sig, $payload, $transfer, 'accepted', '', $now, $now
           )`,
          {
            $requester: record.requester_publickey,
            $source: record.source_transfer_id,
            $tx: record.request_tx,
            $sig: record.request_tx_sig,
            $payload: record.request_payload,
            $transfer: transferId,
            $now: now
          }
        );
        if (!auditInsert?.lastID) {
          throw new Error('The treasury audit row was not recorded.');
        }
        const transfers = await db.all(`SELECT * FROM transfers WHERE id = $id`, { $id: transferId });
        const audits = await db.all(`SELECT * FROM treasury WHERE id = $id`, { $id: auditInsert.lastID });
        return { replayed: false, treasury: audits[0], transfer: transfers[0] };
      });
    } catch (err) {
      if (isInboundHashConflict(err)) {
        return {
          rejected: true,
          reason: 'That inbound payment is already assigned to a transfer.'
        };
      }
      throw err;
    }
  }

  async getTransfersPendingOutboundBroadcast() {
    return this.query(
      `SELECT * FROM transfers
       WHERE status = 'outbound_awaiting'
         AND outbound_tx_sig <> ''
       ORDER BY id ASC`,
      {}
    );
  }

  async getTransfersPendingOutboundConfirmed(currentBlockId) {
    return this.query(
      `SELECT * FROM transfers
       WHERE status = 'outbound_broadcast'
         AND outbound_block_hash <> ''
         AND outbound_confirmation_block_id IS NOT NULL
         AND outbound_confirmation_block_id <= $current_block_id
       ORDER BY id ASC`,
      { $current_block_id: currentBlockId }
    );
  }
}

module.exports = Database;
module.exports.SYNTHETIC_INBOUND_TX_HASH = SYNTHETIC_INBOUND_TX_HASH;
