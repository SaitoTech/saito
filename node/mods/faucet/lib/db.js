/**
 * Faucet registrations. Schema: sql/01_registrations.sql
 * issuance_status: eligible → pending → issued; free mode can re-arm an
 * issued registration after its daily cooldown.
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
      const sqlPath = `${__dirname}/../sql/01_registrations.sql`;
      if (!filesystem.existsSync(sqlPath)) {
        return;
      }
      await this.app.storage.executeDatabase(
        filesystem.readFileSync(sqlPath, 'utf8'),
        this.mod.returnSlug()
      );

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
}

module.exports = FaucetDB;
