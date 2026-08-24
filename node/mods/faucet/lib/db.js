/**
 * Faucet database. Schemas: sql/01_registrations.sql, sql/02_activity.sql
 * registrations: one Saito public key → one registration → at most one issuance
 * activity: request/payment history for Admin
 */

class FaucetDB {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  async initialize() {
    if (this.app.BROWSER) {
      return;
    }

    try {
      const filesystem = this.app.storage.returnFileSystem();
      if (!filesystem) {
        return;
      }
      for (const file of ['01_registrations.sql', '02_activity.sql']) {
        const sqlPath = `${__dirname}/../sql/${file}`;
        if (!filesystem.existsSync(sqlPath)) {
          continue;
        }
        await this.app.storage.executeDatabase(
          filesystem.readFileSync(sqlPath, 'utf8'),
          this.mod.returnSlug()
        );
      }

      await this.app.storage.executeDatabase(
        `DROP TABLE IF EXISTS claims;
         DROP TABLE IF EXISTS auth_requests;
         DROP TABLE IF EXISTS identities;
         DROP TABLE IF EXISTS issuances;`,
        this.mod.returnSlug()
      );

      // Old DBs may still have a non-unique provider index.
      const duplicates = await this.app.storage.queryDatabase(
        `SELECT provider, provider_user_id, COUNT(*) AS cnt
           FROM registrations
          GROUP BY provider, provider_user_id
         HAVING COUNT(*) > 1`,
        {},
        this.mod.returnSlug()
      );
      if (Array.isArray(duplicates) && duplicates.length > 0) {
        console.error(
          'FAUCET: cannot add UNIQUE(provider, provider_user_id) — duplicates exist'
        );
        return;
      }
      await this.app.storage.executeDatabase(
        `DROP INDEX IF EXISTS registrations_provider_uid_idx;
         CREATE UNIQUE INDEX IF NOT EXISTS registrations_provider_uid_uidx
           ON registrations (provider, provider_user_id);`,
        this.mod.returnSlug()
      );
    } catch (err) {
      console.error('FAUCET: initialize failed', err);
    }
  }

  async getRecord(identity = {}) {
    if (this.app.BROWSER) {
      return null;
    }

    const publickey = String(identity.publickey || '').trim();
    if (publickey) {
      const rows = await this.app.storage.queryDatabase(
        `SELECT * FROM registrations WHERE publickey = $publickey LIMIT 1`,
        { $publickey: publickey },
        this.mod.returnSlug()
      );
      if (rows?.[0]) {
        return rows[0];
      }
    }

    const provider = String(identity.provider || '').trim();
    const provider_user_id = String(identity.provider_user_id || '').trim();
    if (provider && provider_user_id) {
      const rows = await this.app.storage.queryDatabase(
        `SELECT * FROM registrations WHERE provider = $provider AND provider_user_id = $provider_user_id LIMIT 1`,
        { $provider: provider, $provider_user_id: provider_user_id },
        this.mod.returnSlug()
      );
      return rows?.[0] || null;
    }

    return null;
  }

  async insertRecord(identity = {}) {
    if (this.app.BROWSER) {
      return null;
    }

    const publickey = String(identity.publickey || '').trim();
    const provider = String(identity.provider || '').trim();
    const provider_user_id = String(identity.provider_user_id || '').trim();
    if (!publickey || !provider || !provider_user_id) {
      return null;
    }

    const now = Date.now();
    try {
      await this.app.storage.runDatabase(
        `INSERT INTO registrations (
           publickey, provider, provider_user_id, provider_username,
           provider_display_name, provider_account_created_at, authenticated_at,
           issuance_status, issuance_amount, issuance_tx_signature, issued_at,
           created_at, updated_at)
         VALUES (
           $publickey, $provider, $provider_user_id, $provider_username,
           $provider_display_name, $provider_account_created_at, $authenticated_at,
           'eligible', '', '', 0, $created_at, $updated_at)`,
        {
          $publickey: publickey,
          $provider: provider,
          $provider_user_id: provider_user_id,
          $provider_username: String(identity.provider_username || ''),
          $provider_display_name: String(identity.provider_display_name || ''),
          $provider_account_created_at: Number(identity.provider_account_created_at) || 0,
          $authenticated_at: now,
          $created_at: now,
          $updated_at: now
        },
        this.mod.returnSlug()
      );
    } catch (err) {
      console.log('FAUCET: insertRecord failed', err);
      return null;
    }

    return true;
  }

  /**
   * Free mode permits one successful allocation per rolling cooldown period.
   * Re-arming is conditional; the later eligible-to-pending transition is the
   * final guard against concurrent payouts.
   */
  async prepareFreeUseClaim(identity = {}, now = Date.now(), cooldown_ms = 86400000) {
    let record = await this.getRecord(identity);
    if (!record) {
      const inserted = await this.insertRecord(identity);
      return inserted
        ? { eligible: true, retry_at: 0, reason: 'new' }
        : { eligible: false, retry_at: 0, reason: 'insert_failed' };
    }

    if (record.issuance_status === 'eligible') {
      return { eligible: true, retry_at: 0, reason: 'eligible' };
    }

    let status_time =
      record.issuance_status === 'issued'
        ? Number(record.issued_at) || 0
        : Number(record.updated_at) || 0;
    let retry_at = status_time + cooldown_ms;

    if (status_time === 0 || now >= retry_at) {
      const reset = await this.updateRecord(
        { publickey: record.publickey, issuance_status: record.issuance_status },
        { issuance_status: 'eligible' }
      );
      if (reset) {
        return { eligible: true, retry_at: 0, reason: 'cooldown_elapsed' };
      }

      // Another request may have completed the same conditional transition.
      record = await this.getRecord(identity);
      if (record?.issuance_status === 'eligible') {
        return { eligible: true, retry_at: 0, reason: 'eligible' };
      }
      status_time =
        record?.issuance_status === 'issued'
          ? Number(record.issued_at) || 0
          : Number(record?.updated_at) || 0;
      retry_at = status_time + cooldown_ms;
    }

    return {
      eligible: false,
      retry_at,
      reason: record?.issuance_status === 'pending' ? 'pending' : 'cooldown'
    };
  }

  async updateRecord(where = {}, changes = {}) {
    if (this.app.BROWSER) {
      return false;
    }

    const params = {};
    const clauses = [];
    for (const col of ['publickey', 'issuance_status']) {
      if (!Object.prototype.hasOwnProperty.call(where, col) || where[col] == null) {
        continue;
      }
      clauses.push(`${col} = $${col}`);
      params[`$${col}`] = where[col];
    }
    if (!clauses.length) {
      return false;
    }

    const sets = [];
    for (const col of [
      'issuance_status',
      'issuance_amount',
      'issuance_tx_signature',
      'issued_at'
    ]) {
      if (!Object.prototype.hasOwnProperty.call(changes, col) || changes[col] === undefined) {
        continue;
      }
      sets.push(`${col} = $${col}_set`);
      params[`$${col}_set`] = changes[col];
    }
    if (!sets.length) {
      return false;
    }

    sets.push('updated_at = $updated_at');
    params.$updated_at = Date.now();

    const res = await this.app.storage.runDatabase(
      `UPDATE registrations SET ${sets.join(', ')} WHERE ${clauses.join(' AND ')}`,
      params,
      this.mod.returnSlug()
    );
    return Number(res?.changes || 0) === 1;
  }

  async insertActivity(row = {}) {
    if (this.app.BROWSER) {
      return null;
    }

    const now = Date.now();
    const res = await this.app.storage.runDatabase(
      `INSERT INTO activity (
         created_at, updated_at,
         requester_publickey, provider, provider_user_id, provider_username,
         requested_amount, request_status, request_reason,
         request_tx_signature, request_block_id, request_block_hash, request_longest_chain,
         payment_status, payment_tx_signature, paid_at,
         payment_block_id, payment_block_hash, payment_longest_chain)
       VALUES (
         $created_at, $updated_at,
         $requester_publickey, $provider, $provider_user_id, $provider_username,
         $requested_amount, $request_status, $request_reason,
         $request_tx_signature, $request_block_id, $request_block_hash, $request_longest_chain,
         $payment_status, $payment_tx_signature, $paid_at,
         $payment_block_id, $payment_block_hash, $payment_longest_chain)`,
      {
        $created_at: now,
        $updated_at: now,
        $requester_publickey: String(row.requester_publickey || ''),
        $provider: String(row.provider || ''),
        $provider_user_id: String(row.provider_user_id || ''),
        $provider_username: String(row.provider_username || ''),
        $requested_amount: String(row.requested_amount || ''),
        $request_status: String(row.request_status || ''),
        $request_reason: String(row.request_reason || ''),
        $request_tx_signature: String(row.request_tx_signature || ''),
        $request_block_id: String(row.request_block_id || ''),
        $request_block_hash: String(row.request_block_hash || ''),
        $request_longest_chain: row.request_longest_chain ? 1 : 0,
        $payment_status: String(row.payment_status || 'none'),
        $payment_tx_signature: String(row.payment_tx_signature || ''),
        $paid_at: Number(row.paid_at) || 0,
        $payment_block_id: String(row.payment_block_id || ''),
        $payment_block_hash: String(row.payment_block_hash || ''),
        $payment_longest_chain: row.payment_longest_chain ? 1 : 0
      },
      this.mod.returnSlug()
    );
    return Number(res?.lastID || 0) || null;
  }

  async updateActivity(id, changes = {}) {
    if (this.app.BROWSER || !id) {
      return false;
    }

    const allowed = [
      'request_status',
      'request_reason',
      'request_tx_signature',
      'request_block_id',
      'request_block_hash',
      'request_longest_chain',
      'payment_status',
      'payment_tx_signature',
      'paid_at',
      'payment_block_id',
      'payment_block_hash',
      'payment_longest_chain'
    ];

    const sets = [];
    const params = { $id: id };
    for (const col of allowed) {
      if (!Object.prototype.hasOwnProperty.call(changes, col) || changes[col] === undefined) {
        continue;
      }
      sets.push(`${col} = $${col}`);
      if (col === 'request_longest_chain' || col === 'payment_longest_chain') {
        params[`$${col}`] = changes[col] ? 1 : 0;
      } else {
        params[`$${col}`] = changes[col];
      }
    }
    if (!sets.length) {
      return false;
    }

    sets.push('updated_at = $updated_at');
    params.$updated_at = Date.now();

    const res = await this.app.storage.runDatabase(
      `UPDATE activity SET ${sets.join(', ')} WHERE id = $id`,
      params,
      this.mod.returnSlug()
    );
    return Number(res?.changes || 0) === 1;
  }

  async findOpenActivity(publickey) {
    if (this.app.BROWSER) {
      return null;
    }
    const pk = String(publickey || '').trim();
    if (!pk) {
      return null;
    }
    const rows = await this.app.storage.queryDatabase(
      `SELECT * FROM activity
        WHERE requester_publickey = $publickey
          AND request_status = 'accepted'
          AND payment_status = 'none'
        ORDER BY id DESC LIMIT 1`,
      { $publickey: pk },
      this.mod.returnSlug()
    );
    return rows?.[0] || null;
  }

  async markPaymentIncluded(signature, block_id, block_hash) {
    if (this.app.BROWSER) {
      return false;
    }
    const sig = String(signature || '').trim();
    if (!sig) {
      return false;
    }
    const res = await this.app.storage.runDatabase(
      `UPDATE activity
          SET payment_status = 'included',
              payment_block_id = $block_id,
              payment_block_hash = $block_hash,
              payment_longest_chain = 1,
              updated_at = $updated_at
        WHERE payment_tx_signature = $signature`,
      {
        $signature: sig,
        $block_id: String(block_id || ''),
        $block_hash: String(block_hash || ''),
        $updated_at: Date.now()
      },
      this.mod.returnSlug()
    );
    return Number(res?.changes || 0) > 0;
  }

  async markChainState(block_id, block_hash, longest_chain) {
    if (this.app.BROWSER) {
      return;
    }
    const hash = String(block_hash || '').trim();
    if (!hash) {
      return;
    }
    const id = String(block_id || '');
    const lc = longest_chain ? 1 : 0;
    const now = Date.now();
    const db = this.mod.returnSlug();

    await this.app.storage.runDatabase(
      `UPDATE activity
          SET request_longest_chain = $lc, updated_at = $updated_at
        WHERE request_block_hash = $hash AND request_block_id = $id`,
      { $lc: lc, $updated_at: now, $hash: hash, $id: id },
      db
    );

    await this.app.storage.runDatabase(
      `UPDATE activity
          SET payment_longest_chain = $lc,
              payment_status = CASE WHEN $lc = 1 THEN 'included' ELSE 'orphaned' END,
              updated_at = $updated_at
        WHERE payment_block_hash = $hash
          AND payment_block_id = $id
          AND payment_status IN ('included', 'orphaned')`,
      { $lc: lc, $updated_at: now, $hash: hash, $id: id },
      db
    );
  }

  async listActivity(filter = 'recent', limit = 50) {
    if (this.app.BROWSER) {
      return [];
    }

    const cap = Math.min(Math.max(Number(limit) || 50, 1), 50);
    let where = '1=1';
    if (filter === 'pending') {
      where = `payment_status IN ('none', 'queued', 'broadcast') AND request_status != 'rejected'`;
    } else if (filter === 'completed') {
      where = `payment_status = 'included' AND payment_longest_chain = 1`;
    } else if (filter === 'failed') {
      where = `request_status = 'rejected' OR payment_status IN ('failed', 'orphaned')`;
    }

    return (
      (await this.app.storage.queryDatabase(
        `SELECT * FROM activity WHERE ${where} ORDER BY id DESC LIMIT $limit`,
        { $limit: cap },
        this.mod.returnSlug()
      )) || []
    );
  }

  async activityCounts() {
    if (this.app.BROWSER) {
      return {
        requests: 0,
        requests_recent: 0,
        rejected: 0,
        pending: 0,
        paid: 0,
        failed: 0,
        orphaned: 0
      };
    }

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const rows = await this.app.storage.queryDatabase(
      `SELECT
         COUNT(*) AS requests,
         COALESCE(SUM(CASE WHEN created_at >= $since THEN 1 ELSE 0 END), 0) AS requests_recent,
         COALESCE(SUM(CASE WHEN request_status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected,
         COALESCE(SUM(CASE WHEN payment_status IN ('queued', 'broadcast') THEN 1 ELSE 0 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN payment_status = 'included' AND payment_longest_chain = 1 THEN 1 ELSE 0 END), 0) AS paid,
         COALESCE(SUM(CASE WHEN payment_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
         COALESCE(SUM(CASE WHEN payment_status = 'orphaned' OR (payment_status = 'included' AND payment_longest_chain = 0) THEN 1 ELSE 0 END), 0) AS orphaned
       FROM activity`,
      { $since: since },
      this.mod.returnSlug()
    );
    const row = rows?.[0] || {};
    return {
      requests: Number(row.requests) || 0,
      requests_recent: Number(row.requests_recent) || 0,
      rejected: Number(row.rejected) || 0,
      pending: Number(row.pending) || 0,
      paid: Number(row.paid) || 0,
      failed: Number(row.failed) || 0,
      orphaned: Number(row.orphaned) || 0
    };
  }
}

module.exports = FaucetDB;
