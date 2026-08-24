const { shouldApplyEvent } = require('./ordering');
const { BUG_PRIORITIES, BUG_SEVERITIES, BUG_STATUSES, MAX_TITLE_LENGTH } = require('./constants');

class BugsDatabase {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  async query(sql, params = {}) {
    return (await this.app.storage.queryDatabase(sql, params, 'bugs')) || [];
  }

  async run(sql, params = {}) {
    return this.app.storage.runDatabase(sql, params, 'bugs');
  }

  async getBug(rootTxSig) {
    const rows = await this.query('SELECT * FROM bugs WHERE root_tx_sig = $root_tx_sig LIMIT 1', {
      $root_tx_sig: rootTxSig
    });
    return rows[0] || null;
  }

  async hasEvent(txSig) {
    const rows = await this.query('SELECT * FROM bug_events WHERE tx_sig = $tx_sig LIMIT 1', {
      $tx_sig: txSig
    });
    return rows[0] || null;
  }

  async reconcileEventConfirmation(txSig, blockId, txOrdinal) {
    if (!blockId) return;
    await this.run(
      `UPDATE bug_events
         SET block_id = $block_id, tx_ordinal = $tx_ordinal
       WHERE tx_sig = $tx_sig AND block_id = 0`,
      { $block_id: blockId, $tx_ordinal: txOrdinal, $tx_sig: txSig }
    );
    await this.run(
      `UPDATE bugs
         SET latest_metadata_block_id = $block_id,
             latest_metadata_tx_ordinal = $tx_ordinal
       WHERE latest_metadata_tx_sig = $tx_sig AND latest_metadata_block_id = 0`,
      { $block_id: blockId, $tx_ordinal: txOrdinal, $tx_sig: txSig }
    );
  }

  async recordEvent(event, applied) {
    await this.run(
      `INSERT OR IGNORE INTO bug_events
        (tx_sig, bug_id, request, action, signer_publickey, block_id, tx_ordinal,
         tx_timestamp, applied, processed_at)
       VALUES
        ($tx_sig, $bug_id, $request, $action, $signer_publickey, $block_id, $tx_ordinal,
         $tx_timestamp, $applied, $processed_at)`,
      {
        $tx_sig: event.tx_sig,
        $bug_id: event.bug_id,
        $request: event.request,
        $action: event.action || '',
        $signer_publickey: event.signer,
        $block_id: event.block_id,
        $tx_ordinal: event.tx_ordinal,
        $tx_timestamp: event.tx_timestamp,
        $applied: applied ? 1 : 0,
        $processed_at: Date.now()
      }
    );
  }

  async createBug(data, event, reporterVerified) {
    const completedAt = data.status === 'completed' ? event.tx_timestamp : 0;
    await this.run(
      `INSERT INTO bugs
        (root_tx_sig, source_tx_sig, title, status, severity, priority, weight,
         reporter_publickey, reporter_verified, added_by_publickey, assignee_publickey,
         created_at, updated_at, completed_at, tracked, latest_metadata_tx_sig,
         latest_metadata_previous_tx_sig, latest_metadata_block_id,
         latest_metadata_tx_ordinal, latest_metadata_timestamp)
       VALUES
        ($root_tx_sig, $source_tx_sig, $title, $status, $severity, $priority, $weight,
         $reporter_publickey, $reporter_verified, $added_by_publickey, $assignee_publickey,
         $created_at, $updated_at, $completed_at, 1, $latest_metadata_tx_sig,
         $latest_metadata_previous_tx_sig, $latest_metadata_block_id,
         $latest_metadata_tx_ordinal, $latest_metadata_timestamp)`,
      {
        $root_tx_sig: data.root_tx_sig,
        $source_tx_sig: data.source_tx_sig,
        $title: data.title,
        $status: data.status,
        $severity: data.severity,
        $priority: data.priority,
        $weight: data.weight,
        $reporter_publickey: data.reporter_publickey,
        $reporter_verified: reporterVerified ? 1 : 0,
        $added_by_publickey: event.signer,
        $assignee_publickey: data.assignee_publickey,
        $created_at: event.tx_timestamp,
        $updated_at: event.tx_timestamp,
        $completed_at: completedAt,
        $latest_metadata_tx_sig: event.tx_sig,
        $latest_metadata_previous_tx_sig: event.previous_metadata_tx_sig || '',
        $latest_metadata_block_id: event.block_id,
        $latest_metadata_tx_ordinal: event.tx_ordinal,
        $latest_metadata_timestamp: event.tx_timestamp
      }
    );
  }

  async replaceBugFromCreate(data, event, reporterVerified) {
    const completedAt = data.status === 'completed' ? event.tx_timestamp : 0;
    await this.run(
      `UPDATE bugs SET
         source_tx_sig = $source_tx_sig,
         title = $title,
         status = $status,
         severity = $severity,
         priority = $priority,
         weight = $weight,
         reporter_publickey = $reporter_publickey,
         reporter_verified = CASE
           WHEN $reporter_verified = 1 THEN 1
           ELSE reporter_verified
         END,
         added_by_publickey = $added_by_publickey,
         assignee_publickey = $assignee_publickey,
         updated_at = $updated_at,
         completed_at = $completed_at,
         tracked = 1,
         latest_metadata_tx_sig = $latest_metadata_tx_sig,
         latest_metadata_previous_tx_sig = $latest_metadata_previous_tx_sig,
         latest_metadata_block_id = $latest_metadata_block_id,
         latest_metadata_tx_ordinal = $latest_metadata_tx_ordinal,
         latest_metadata_timestamp = $latest_metadata_timestamp
       WHERE root_tx_sig = $root_tx_sig`,
      {
        $root_tx_sig: data.root_tx_sig,
        $source_tx_sig: data.source_tx_sig,
        $title: data.title,
        $status: data.status,
        $severity: data.severity,
        $priority: data.priority,
        $weight: data.weight,
        $reporter_publickey: data.reporter_publickey,
        $reporter_verified: reporterVerified ? 1 : 0,
        $added_by_publickey: event.signer,
        $assignee_publickey: data.assignee_publickey,
        $updated_at: event.tx_timestamp,
        $completed_at: completedAt,
        $latest_metadata_tx_sig: event.tx_sig,
        $latest_metadata_previous_tx_sig: event.previous_metadata_tx_sig || '',
        $latest_metadata_block_id: event.block_id,
        $latest_metadata_tx_ordinal: event.tx_ordinal,
        $latest_metadata_timestamp: event.tx_timestamp
      }
    );
  }

  async applyUpdate(bug, data, event) {
    const fields = {
      'set-title': ['title', data.title],
      'set-status': ['status', data.status],
      'set-severity': ['severity', data.severity],
      'set-priority': ['priority', data.priority],
      'set-weight': ['weight', data.weight],
      'set-assignee': ['assignee_publickey', data.assignee_publickey],
      untrack: ['tracked', 0],
      retrack: ['tracked', 1]
    };
    const [column, value] = fields[data.action];
    const params = {
      $root_tx_sig: bug.root_tx_sig,
      $value: value,
      $updated_at: event.tx_timestamp,
      $completed_at:
        data.action === 'set-status'
          ? data.status === 'completed'
            ? event.tx_timestamp
            : 0
          : bug.completed_at,
      $latest_metadata_tx_sig: event.tx_sig,
      $latest_metadata_previous_tx_sig: event.previous_metadata_tx_sig || '',
      $latest_metadata_block_id: event.block_id,
      $latest_metadata_tx_ordinal: event.tx_ordinal,
      $latest_metadata_timestamp: event.tx_timestamp
    };
    await this.run(
      `UPDATE bugs SET
         ${column} = $value,
         updated_at = $updated_at,
         completed_at = $completed_at,
         latest_metadata_tx_sig = $latest_metadata_tx_sig,
         latest_metadata_previous_tx_sig = $latest_metadata_previous_tx_sig,
         latest_metadata_block_id = $latest_metadata_block_id,
         latest_metadata_tx_ordinal = $latest_metadata_tx_ordinal,
         latest_metadata_timestamp = $latest_metadata_timestamp
       WHERE root_tx_sig = $root_tx_sig`,
      params
    );
  }

  async applyAcceptedEvent(validation, event, reporterVerified = false) {
    const duplicate = await this.hasEvent(event.tx_sig);
    if (duplicate) {
      await this.reconcileEventConfirmation(event.tx_sig, event.block_id, event.tx_ordinal);
      return { accepted: true, applied: Boolean(duplicate.applied), duplicate: true };
    }

    let bug = await this.getBug(event.bug_id);
    if (!bug && validation.request === 'update bug') {
      return { accepted: false, deferred: true, error: 'Bug create transaction has not arrived' };
    }

    const applied = !bug || shouldApplyEvent(bug, event);
    if (applied && validation.request === 'create bug') {
      if (bug) await this.replaceBugFromCreate(validation.data, event, reporterVerified);
      else await this.createBug(validation.data, event, reporterVerified);
    } else if (applied) {
      await this.applyUpdate(bug, validation.data, event);
    }
    await this.recordEvent(event, applied);
    return { accepted: true, applied, duplicate: false };
  }

  async noteReply(rootTxSig, timestamp) {
    await this.run(
      `UPDATE bugs
          SET reply_count = reply_count + 1,
              updated_at = CASE WHEN updated_at < $timestamp THEN $timestamp ELSE updated_at END
        WHERE root_tx_sig = $root_tx_sig AND tracked = 1`,
      { $root_tx_sig: rootTxSig, $timestamp: timestamp }
    );
  }

  async listBugs(filters = {}) {
    const clauses = ['tracked = 1'];
    const params = {};
    if (filters.view === 'completed') clauses.push("status = 'completed'");
    else if (filters.view !== 'all') clauses.push("status != 'completed'");
    const allowed = {
      status: BUG_STATUSES,
      severity: BUG_SEVERITIES,
      priority: BUG_PRIORITIES
    };
    for (const field of Object.keys(allowed)) {
      if (allowed[field].includes(filters[field])) {
        clauses.push(`${field} = $${field}`);
        params[`$${field}`] = filters[field];
      }
    }
    if (filters.assignee_publickey) {
      clauses.push('assignee_publickey = $assignee_publickey');
      params.$assignee_publickey = String(filters.assignee_publickey).slice(0, 128);
    }
    if (filters.reporter_publickey) {
      clauses.push('reporter_publickey = $reporter_publickey');
      params.$reporter_publickey = String(filters.reporter_publickey).slice(0, 128);
    }
    if (filters.search) {
      clauses.push("title LIKE $search ESCAPE '\\'");
      params.$search = `%${String(filters.search)
        .slice(0, MAX_TITLE_LENGTH)
        .replace(/[\\%_]/g, '\\$&')}%`;
    }

    const sort =
      {
        weight: 'weight ASC, updated_at DESC',
        updated: 'updated_at DESC, weight ASC',
        created: 'created_at DESC, weight ASC',
        severity:
          "CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, weight ASC",
        priority:
          "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, weight ASC"
      }[filters.sort] || 'weight ASC, updated_at DESC';

    return this.query(
      `SELECT * FROM bugs WHERE ${clauses.join(' AND ')} ORDER BY ${sort} LIMIT 500`,
      params
    );
  }

  async listPrunable(now) {
    const cutoff = Number(now) - this.mod.completedRetentionMs;
    return this.query(
      `SELECT * FROM bugs
        WHERE status = 'completed' AND completed_at > 0 AND completed_at <= $cutoff`,
      { $cutoff: cutoff }
    );
  }
}

module.exports = BugsDatabase;
