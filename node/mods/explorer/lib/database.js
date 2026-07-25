class ExplorerDatabase {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  get dbname() {
    return this.mod.dbname;
  }

  async upsertBlockStatistics(stats) {
    const sql = `INSERT OR REPLACE INTO blocks (
			block_id,
			block_hash,
			treasury,
			graveyard,
			total_fees,
			total_fees_new,
			total_fees_atr,
			total_fees_cumulative,
			avg_total_fees,
			avg_total_fees_new,
			avg_total_fees_atr,
			total_payout_routing,
			total_payout_mining,
			total_payout_treasury,
			total_payout_graveyard,
			total_payout_atr,
			avg_payout_routing,
			avg_payout_mining,
			avg_payout_treasury,
			avg_payout_graveyard,
			avg_payout_atr,
			avg_fee_per_byte,
			fee_per_byte,
			avg_nolan_rebroadcast_per_block,
			burn_fee,
			difficulty,
			previous_block_unpaid,
			has_golden_ticket,
			utxo,
			total_supply
		) VALUES (
			$block_id,
			$block_hash,
			$treasury,
			$graveyard,
			$total_fees,
			$total_fees_new,
			$total_fees_atr,
			$total_fees_cumulative,
			$avg_total_fees,
			$avg_total_fees_new,
			$avg_total_fees_atr,
			$total_payout_routing,
			$total_payout_mining,
			$total_payout_treasury,
			$total_payout_graveyard,
			$total_payout_atr,
			$avg_payout_routing,
			$avg_payout_mining,
			$avg_payout_treasury,
			$avg_payout_graveyard,
			$avg_payout_atr,
			$avg_fee_per_byte,
			$fee_per_byte,
			$avg_nolan_rebroadcast_per_block,
			$burn_fee,
			$difficulty,
			$previous_block_unpaid,
			$has_golden_ticket,
			$utxo,
			$total_supply
		)`;

    return this.runBlockStatisticsStatement(sql, stats, 'upsertBlockStatistics');
  }

  async insertBlockStatistics(stats) {
    return this.upsertBlockStatistics(stats);
  }

  blockStatisticsParams(stats) {
    return {
      $block_id: stats.block_id,
      $block_hash: stats.block_hash,
      $treasury: stats.treasury,
      $graveyard: stats.graveyard,
      $total_fees: stats.total_fees,
      $total_fees_new: stats.total_fees_new,
      $total_fees_atr: stats.total_fees_atr,
      $total_fees_cumulative: stats.total_fees_cumulative,
      $avg_total_fees: stats.avg_total_fees,
      $avg_total_fees_new: stats.avg_total_fees_new,
      $avg_total_fees_atr: stats.avg_total_fees_atr,
      $total_payout_routing: stats.total_payout_routing,
      $total_payout_mining: stats.total_payout_mining,
      $total_payout_treasury: stats.total_payout_treasury,
      $total_payout_graveyard: stats.total_payout_graveyard,
      $total_payout_atr: stats.total_payout_atr,
      $avg_payout_routing: stats.avg_payout_routing,
      $avg_payout_mining: stats.avg_payout_mining,
      $avg_payout_treasury: stats.avg_payout_treasury,
      $avg_payout_graveyard: stats.avg_payout_graveyard,
      $avg_payout_atr: stats.avg_payout_atr,
      $avg_fee_per_byte: stats.avg_fee_per_byte,
      $fee_per_byte: stats.fee_per_byte,
      $avg_nolan_rebroadcast_per_block: stats.avg_nolan_rebroadcast_per_block,
      $burn_fee: stats.burn_fee,
      $difficulty: stats.difficulty,
      $previous_block_unpaid: stats.previous_block_unpaid,
      $has_golden_ticket: stats.has_golden_ticket,
      $utxo: stats.utxo,
      $total_supply: stats.total_supply
    };
  }

  async runBlockStatisticsStatement(sql, stats, label) {
    const params = this.blockStatisticsParams(stats);

    try {
      const res = await this.app.storage.runDatabase(sql, params, this.dbname);
      if (res?.changes > 0) {
        return { success: true };
      }
      return { success: false, reason: 'no changes' };
    } catch (err) {
      console.error(`Explorer Database: ${label} failed`, err);
      return { success: false, reason: err?.message || 'write failed' };
    }
  }

  async getStatisticsByBlockHash(blockHash) {
    if (!blockHash) {
      return null;
    }

    try {
      const rows =
        (await this.app.storage.queryDatabase(
          `SELECT * FROM blocks WHERE block_hash = $block_hash LIMIT 1`,
          { $block_hash: String(blockHash) },
          this.dbname
        )) || [];
      return rows[0] || null;
    } catch (err) {
      console.error('Explorer Database: getStatisticsByBlockHash failed', err);
      return null;
    }
  }

  async getStatisticsByBlockHashes(hashes = []) {
    if (!Array.isArray(hashes) || !hashes.length) {
      return [];
    }

    const params = {};
    const placeholders = hashes
      .map((hash, index) => {
        const key = `$hash${index}`;
        params[key] = hash;
        return key;
      })
      .join(', ');

    const sql = `SELECT * FROM blocks WHERE block_hash IN (${placeholders})`;

    try {
      return (await this.app.storage.queryDatabase(sql, params, this.dbname)) || [];
    } catch (err) {
      console.error('Explorer Database: getStatisticsByBlockHashes failed', err);
      return [];
    }
  }

  async insertAddressRows(rows = []) {
    if (!Array.isArray(rows) || !rows.length) {
      return { inserted: 0, skipped: 0 };
    }

    const sql = `INSERT OR IGNORE INTO addresses (
			publickey,
			tx_hash,
			block_hash,
			block_id,
			is_longest_chain,
			recipient,
			delta
		) VALUES (
			$publickey,
			$tx_hash,
			$block_hash,
			$block_id,
			$is_longest_chain,
			$recipient,
			$delta
		)`;

    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const params = {
        $publickey: row.publickey,
        $tx_hash: row.tx_hash,
        $block_hash: row.block_hash,
        $block_id: row.block_id,
        $is_longest_chain: row.is_longest_chain ?? 1,
        $recipient: row.recipient,
        $delta: row.delta
      };

      try {
        const res = await this.app.storage.runDatabase(sql, params, this.dbname);
        if (res?.changes > 0) {
          inserted += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        console.error('Explorer Database: insertAddressRows failed', err);
        skipped += 1;
      }
    }

    return { inserted, skipped };
  }

  async updateAddressLongestChainState(block_id, block_hash, longest_chain) {
    const params = {
      $block_id: Number(block_id) || 0,
      $block_hash: String(block_hash || ''),
      $is_longest_chain: longest_chain ? 1 : 0
    };

    try {
      return await this.app.storage.runDatabase(
        `UPDATE addresses
				 SET is_longest_chain = $is_longest_chain
				 WHERE block_id = $block_id AND block_hash = $block_hash`,
        params,
        this.dbname
      );
    } catch (err) {
      console.error('Explorer Database: updateAddressLongestChainState failed', err);
      return null;
    }
  }

  async pruneAddressesBeforeBlockId(cutoff_block_id) {
    const cutoff = Number(cutoff_block_id);
    if (!Number.isFinite(cutoff) || cutoff <= 0) {
      return { changes: 0 };
    }

    try {
      return await this.app.storage.runDatabase(
        `DELETE FROM addresses WHERE block_id < $cutoff_block_id`,
        { $cutoff_block_id: cutoff },
        this.dbname
      );
    } catch (err) {
      console.error('Explorer Database: pruneAddressesBeforeBlockId failed', err);
      return null;
    }
  }

  async getAddressActivity(publickey, limit = 50) {
    if (!publickey) {
      return [];
    }

    const boundedLimit = Math.min(Math.max(Math.floor(Number(limit) || 50), 1), 500);

    try {
      return (
        (await this.app.storage.queryDatabase(
          `SELECT publickey, tx_hash, block_hash, block_id, is_longest_chain, recipient, delta
					 FROM addresses
					 WHERE publickey = $publickey
					   AND is_longest_chain = 1
					 ORDER BY block_id DESC
					 LIMIT $limit`,
          {
            $publickey: String(publickey),
            $limit: boundedLimit
          },
          this.dbname
        )) || []
      );
    } catch (err) {
      console.error('Explorer Database: getAddressActivity failed', err);
      return [];
    }
  }
}

module.exports = ExplorerDatabase;
