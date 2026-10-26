const fs = require('fs');
const path = require('path');

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
    if (!String(defined[0]?.sql || '').includes("'inbound_awaiting'")) {
      await this.run(`ALTER TABLE transfers RENAME TO transfers_legacy`, {});
      const sql = fs.readFileSync(path.join(__dirname, '../sql/transfers.sql'), 'utf8');
      if (this.app.storage.executeDatabase) {
        await this.app.storage.executeDatabase(sql, this.dbname());
      } else {
        await this.run(sql, {});
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
      ['inbound_tx_id', `TEXT NOT NULL DEFAULT ''`],
      ['outbound_tx_id', `TEXT NOT NULL DEFAULT ''`],
      ['inbound_confirmation_block_id', 'INTEGER'],
      ['outbound_confirmation_block_id', 'INTEGER'],
      ['mode', `TEXT NOT NULL DEFAULT 'automatic' CHECK (mode IN ('automatic', 'manual'))`]
    ];
    for (const [name, definition] of additions) {
      if (!present.has(name)) {
        await this.run(`ALTER TABLE transfers ADD COLUMN ${name} ${definition}`, {});
      }
    }
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
      'mode'
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

  async getTransfersPendingInboundBroadcast(cutoff) {
    return this.query(
      `SELECT * FROM transfers
       WHERE mode = 'automatic'
         AND purpose != 'migration'
         AND status = 'inbound_awaiting'
         AND created_at >= $cutoff
       ORDER BY id ASC`,
      { $cutoff: cutoff }
    );
  }

  async getTransfersPendingInboundConfirmed() {
    return this.query(
      `SELECT * FROM transfers
       WHERE mode = 'automatic'
         AND purpose != 'migration'
         AND status = 'inbound_broadcast'
         AND inbound_tx_hash <> ''
         AND inbound_confirmations >= inbound_confirmations_required
       ORDER BY id ASC`,
      {}
    );
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
