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

  async saveCredentials(publicKey, ciphertext) {
    await this.run(
      `INSERT INTO accounts (publickey, ciphertext, created_at)
       VALUES ($publickey, $ciphertext, $created_at)
       ON CONFLICT(publickey) DO UPDATE SET ciphertext = excluded.ciphertext`,
      {
        $publickey: publicKey,
        $ciphertext: ciphertext,
        $created_at: Date.now()
      }
    );
  }

  async getCredentials(publicKey) {
    const rows = await this.query(`SELECT ciphertext FROM accounts WHERE publickey = $publickey`, {
      $publickey: publicKey
    });
    return rows[0]?.ciphertext || null;
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

  async insertTransfer({ mixinUserId, assetId, destination, amount, memo }) {
    const now = Date.now();
    await this.run(
      `INSERT INTO transfers (
         mixin_user_id, asset_id, destination, amount, memo, hash, status, error, created_at, updated_at
       ) VALUES (
         $mixin_user_id, $asset_id, $destination, $amount, $memo, '', 'sending', '', $created_at, $updated_at
       )`,
      {
        $mixin_user_id: mixinUserId,
        $asset_id: assetId,
        $destination: destination,
        $amount: String(amount),
        $memo: memo || '',
        $created_at: now,
        $updated_at: now
      }
    );
    const rows = await this.query(`SELECT last_insert_rowid() AS id`, {});
    return rows[0]?.id || null;
  }

  async updateTransfer(id, { hash, status, error, updatedAt }) {
    await this.run(
      `UPDATE transfers
       SET hash = $hash, status = $status, error = $error, updated_at = $updated_at
       WHERE id = $id`,
      {
        $id: id,
        $hash: hash || '',
        $status: status,
        $error: error || '',
        $updated_at: updatedAt || Date.now()
      }
    );
  }

  async getTransfer(id) {
    const rows = await this.query(`SELECT * FROM transfers WHERE id = $id`, { $id: id });
    return rows[0] || null;
  }

  async findTransfers({ mixinUserId, status } = {}) {
    const filters = [];
    const params = {};

    if (mixinUserId) {
      filters.push('mixin_user_id = $mixin_user_id');
      params.$mixin_user_id = mixinUserId;
    }
    if (status) {
      filters.push('status = $status');
      params.$status = status;
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return this.query(`SELECT * FROM transfers ${where} ORDER BY created_at ASC`, params);
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
      if (!existing) {
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
}

module.exports = Database;
