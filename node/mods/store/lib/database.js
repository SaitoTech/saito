const Transaction = require('../../../lib/saito/transaction').default;

class Database {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	get dbname() {
		return this.mod.dbname;
	}

	async ensureSchema() {
		const listing_columns = [
			'ALTER TABLE listings ADD COLUMN in_flight INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE listings ADD COLUMN reserved_order_id INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE listings ADD COLUMN block_id_listed INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE listings ADD COLUMN block_hash_listed TEXT NOT NULL DEFAULT ""',
			'ALTER TABLE listings ADD COLUMN transaction_id_listed INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE listings ADD COLUMN longest_chain_listed INTEGER NOT NULL DEFAULT 1',
			'ALTER TABLE listings ADD COLUMN block_id_sold INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE listings ADD COLUMN block_hash_sold TEXT NOT NULL DEFAULT ""',
			'ALTER TABLE listings ADD COLUMN transaction_id_sold INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE listings ADD COLUMN longest_chain_sold INTEGER NOT NULL DEFAULT 0'
		];
		const order_columns = [
			'ALTER TABLE orders ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1',
			'ALTER TABLE orders ADD COLUMN payment_utxo_slip TEXT NOT NULL DEFAULT ""',
			'ALTER TABLE orders ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT "pending"',
			'ALTER TABLE orders ADD COLUMN block_id_received INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE orders ADD COLUMN block_hash_received TEXT NOT NULL DEFAULT ""',
			'ALTER TABLE orders ADD COLUMN transaction_id_received INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE orders ADD COLUMN longest_chain_received INTEGER NOT NULL DEFAULT 1'
		];

		for (const sql of [...listing_columns, ...order_columns]) {
			try {
				await this.app.storage.runDatabase(sql, {}, this.dbname);
			} catch (err) {
				// column already exists
			}
		}

		await this.migrateListingChainFields();
		await this.migrateOrderChainFields();
	}

	async migrateListingChainFields() {
		const migrations = [
			`UPDATE listings
			 SET block_id_listed = block_id,
			     block_hash_listed = block_hash,
			     transaction_id_listed = transaction_id,
			     longest_chain_listed = longest_chain
			 WHERE block_id_listed = 0 AND block_id != 0`,
			`UPDATE listings
			 SET longest_chain_sold = 1
			 WHERE block_id_sold = 0 AND spent = 1 AND block_id != 0`,
			`UPDATE listings
			 SET block_id_sold = block_id,
			     block_hash_sold = block_hash,
			     transaction_id_sold = transaction_id,
			     longest_chain_sold = longest_chain
			 WHERE block_id_sold = 0 AND spent = 1 AND block_id != 0`
		];

		for (const sql of migrations) {
			try {
				await this.app.storage.runDatabase(sql, {}, this.dbname);
			} catch (err) {
				// legacy columns may be absent on fresh installs
			}
		}
	}

	async migrateOrderChainFields() {
		const migrations = [
			`UPDATE orders
			 SET block_id_received = block_id_added,
			     block_hash_received = block_hash_added,
			     transaction_id_received = transaction_id_added,
			     longest_chain_received = longest_chain_added
			 WHERE block_id_received = 0 AND block_id_added != 0`,
			`UPDATE orders
			 SET block_id_fulfilled = block_id_confirmed,
			     block_hash_fulfilled = block_hash_confirmed,
			     transaction_id_fulfilled = transaction_id_confirmed,
			     longest_chain_fulfilled = longest_chain_confirmed
			 WHERE block_id_fulfilled = 0 AND block_id_confirmed != 0`
		];

		for (const sql of migrations) {
			try {
				await this.app.storage.runDatabase(sql, {}, this.dbname);
			} catch (err) {
				// legacy columns may be absent on fresh installs
			}
		}
	}

	// --- listings (authoritative: one row per listing transaction) ---

	async insertListingRow(row) {
		await this.app.storage.runDatabase(
			`INSERT INTO listings (
			  signature, nft_id, seller, quantity, price,
			  access_hash, access_script, p2sh_address, slip_id,
			  block_id_listed, block_hash_listed, transaction_id_listed, longest_chain_listed,
			  block_id_sold, block_hash_sold, transaction_id_sold, longest_chain_sold,
			  on_chain, in_flight, reserved_order_id,
			  utxo_slip1, utxo_slip2, utxo_slip3,
			  created_at, updated_at
			) VALUES (
			  $signature, $nft_id, $seller, $quantity, $price,
			  $access_hash, $access_script, $p2sh_address, $slip_id,
			  $block_id_listed, $block_hash_listed, $transaction_id_listed, $longest_chain_listed,
			  $block_id_sold, $block_hash_sold, $transaction_id_sold, $longest_chain_sold,
			  $on_chain, $in_flight, $reserved_order_id,
			  $utxo_slip1, $utxo_slip2, $utxo_slip3,
			  $created_at, $updated_at
			)`,
			{
				$signature: row.signature,
				$nft_id: row.nft_id,
				$seller: row.seller || '',
				$quantity: Number(row.quantity ?? 1),
				$price: Number(row.price ?? 0),
				$access_hash: row.access_hash || '',
				$access_script: row.access_script || '',
				$p2sh_address: row.p2sh_address || '',
				$slip_id: row.slip_id ?? 0,
				$block_id_listed: row.block_id_listed ?? row.block_id ?? 0,
				$block_hash_listed: row.block_hash_listed || row.block_hash || '',
				$transaction_id_listed: row.transaction_id_listed ?? row.transaction_id ?? 0,
				$longest_chain_listed: row.longest_chain_listed ?? row.longest_chain ?? 1,
				$block_id_sold: row.block_id_sold ?? 0,
				$block_hash_sold: row.block_hash_sold || '',
				$transaction_id_sold: row.transaction_id_sold ?? 0,
				$longest_chain_sold: row.longest_chain_sold ?? 0,
				$on_chain: row.on_chain ?? 1,
				$in_flight: row.in_flight ?? 0,
				$reserved_order_id: row.reserved_order_id ?? 0,
				$utxo_slip1: row.utxo_slip1 || '',
				$utxo_slip2: row.utxo_slip2 || '',
				$utxo_slip3: row.utxo_slip3 || '',
				$created_at: row.created_at,
				$updated_at: row.updated_at
			},
			this.dbname
		);
	}

	async returnListingBySignature(signature) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM listings WHERE signature = $signature LIMIT 1`,
			{ $signature: signature },
			this.dbname
		);
		return res?.[0] || null;
	}

	async returnSpendableListingsForBucket(nft_id, price, limit = 1) {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM listings
				 WHERE nft_id = $nft_id AND price = $price
				   AND on_chain = 1
				   AND longest_chain_listed = 1
				   AND (block_id_sold = 0 OR longest_chain_sold = 0)
				   AND in_flight = 0
				 ORDER BY created_at ASC
				 LIMIT $limit`,
				{ $nft_id: nft_id, $price: Number(price), $limit: Number(limit) || 1 },
				this.dbname
			);
		} catch (err) {
			return [];
		}
	}

	async returnActiveListingForBucket(nft_id, price) {
		const rows = await this.returnSpendableListingsForBucket(nft_id, price, 1);
		return rows?.[0] || null;
	}

	async returnAllActiveListingRows() {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM listings
				 WHERE on_chain = 1
				   AND longest_chain_listed = 1
				   AND (block_id_sold = 0 OR longest_chain_sold = 0)
				 ORDER BY created_at ASC`,
				{},
				this.dbname
			);
		} catch (err) {
			return [];
		}
	}

	async markListingSold(signature, chain = {}, now = Date.now()) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET block_id_sold = $block_id_sold,
			     block_hash_sold = $block_hash_sold,
			     transaction_id_sold = $transaction_id_sold,
			     longest_chain_sold = 1,
			     in_flight = 0,
			     reserved_order_id = 0,
			     updated_at = $updated_at
			 WHERE signature = $signature`,
			{
				$signature: signature,
				$block_id_sold: Number(chain.block_id ?? 0),
				$block_hash_sold: String(chain.block_hash || ''),
				$transaction_id_sold: Number(chain.transaction_id ?? 0),
				$updated_at: now
			},
			this.dbname
		);
	}

	async reserveListing(signature, order_id, now) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET in_flight = 1, reserved_order_id = $reserved_order_id, updated_at = $updated_at
			 WHERE signature = $signature
			   AND longest_chain_listed = 1
			   AND (block_id_sold = 0 OR longest_chain_sold = 0)
			   AND in_flight = 0`,
			{
				$signature: signature,
				$reserved_order_id: Number(order_id) || 0,
				$updated_at: now
			},
			this.dbname
		);
	}

	async releaseListing(signature, now) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET in_flight = 0, reserved_order_id = 0, updated_at = $updated_at
			 WHERE signature = $signature`,
			{ $signature: signature, $updated_at: now },
			this.dbname
		);
	}

	async releaseListingsForOrder(order_id, now = Date.now()) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET in_flight = 0, reserved_order_id = 0, updated_at = $updated_at
			 WHERE reserved_order_id = $reserved_order_id`,
			{
				$reserved_order_id: Number(order_id) || 0,
				$updated_at: now
			},
			this.dbname
		);
	}

	async updateListingsListedChainState(block_id, block_hash, longest_chain) {
		await this.app.storage.runDatabase(
			`UPDATE listings SET longest_chain_listed = $longest_chain
			 WHERE block_id_listed = $block_id AND block_hash_listed = $block_hash`,
			{
				$block_id: Number(block_id) || 0,
				$block_hash: String(block_hash || ''),
				$longest_chain: longest_chain ? 1 : 0
			},
			this.dbname
		);
	}

	async updateListingsSoldChainState(block_id, block_hash, longest_chain) {
		await this.app.storage.runDatabase(
			`UPDATE listings SET longest_chain_sold = $longest_chain
			 WHERE block_id_sold = $block_id AND block_hash_sold = $block_hash`,
			{
				$block_id: Number(block_id) || 0,
				$block_hash: String(block_hash || ''),
				$longest_chain: longest_chain ? 1 : 0
			},
			this.dbname
		);
	}

	async scanListingsForSummaryRebuild() {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT nft_id, price, SUM(quantity) AS total_quantity
				 FROM listings
				 WHERE on_chain = 1
				   AND longest_chain_listed = 1
				   AND (block_id_sold = 0 OR longest_chain_sold = 0)
				   AND in_flight = 0
				 GROUP BY nft_id, price`,
				{},
				this.dbname
			);
		} catch (err) {
			console.log('Store Database: scanListingsForSummaryRebuild failed', err?.message);
			return [];
		}
	}

	// --- summary (derived market aggregate) ---

	async insertSummary(summary) {
		await this.app.storage.runDatabase(
			`INSERT INTO summary (
			  nft_id, price, title, description, image,
			  quantity_available, quantity_pending, quantity_sold, updated_at
			) VALUES (
			  $nft_id, $price, $title, $description, $image,
			  $quantity_available, $quantity_pending, $quantity_sold, $updated_at
			)`,
			{
				$nft_id: summary.nft_id,
				$price: Number(summary.price ?? 0),
				$title: summary.title || '',
				$description: summary.description || '',
				$image: summary.image ?? null,
				$quantity_available: Number(summary.quantity_available ?? 0),
				$quantity_pending: Number(summary.quantity_pending ?? 0),
				$quantity_sold: Number(summary.quantity_sold ?? 0),
				$updated_at: summary.updated_at ?? Date.now()
			},
			this.dbname
		);
	}

	async returnSummary(summary_id) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM summary WHERE id = $id LIMIT 1`,
			{ $id: Number(summary_id) },
			this.dbname
		);
		return res?.[0] || null;
	}

	async returnSummaryByBucket(nft_id, price) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM summary WHERE nft_id = $nft_id AND price = $price LIMIT 1`,
			{ $nft_id: nft_id, $price: Number(price) },
			this.dbname
		);
		return res?.[0] || null;
	}

	async loadAllSummaries() {
		try {
			return await this.app.storage.queryDatabase(`SELECT * FROM summary`, {}, this.dbname);
		} catch (err) {
			return [];
		}
	}

	async clearSummaries() {
		await this.app.storage.runDatabase(`DELETE FROM summary`, {}, this.dbname);
	}

	async deleteSummary(summary_id) {
		await this.app.storage.runDatabase(
			`DELETE FROM summary WHERE id = $id`,
			{ $id: Number(summary_id) },
			this.dbname
		);
	}

	async adjustSummaryQuantities(summary_id, available_delta, pending_delta, sold_delta, now) {
		await this.app.storage.runDatabase(
			`UPDATE summary
			 SET quantity_available = quantity_available + $available_delta,
			     quantity_pending = quantity_pending + $pending_delta,
			     quantity_sold = quantity_sold + $sold_delta,
			     updated_at = $updated_at
			 WHERE id = $id
			   AND quantity_available + $available_delta >= 0
			   AND quantity_pending + $pending_delta >= 0
			   AND quantity_sold + $sold_delta >= 0`,
			{
				$id: Number(summary_id),
				$available_delta: Number(available_delta),
				$pending_delta: Number(pending_delta),
				$sold_delta: Number(sold_delta),
				$updated_at: now
			},
			this.dbname
		);
	}

	// --- orders ---

	async insertOrder(order) {
		await this.app.storage.runDatabase(
			`INSERT INTO orders (
			  order_tx_sig, buyer, nft_id, price, quantity,
			  payment_tx_sig, payment_output_index, payment_amount, payment_utxo_slip,
			  block_id_received, block_hash_received, transaction_id_received, longest_chain_received,
			  settlement_tx_sig,
			  block_id_fulfilled, block_hash_fulfilled, transaction_id_fulfilled, longest_chain_fulfilled,
			  attempts, status,
			  created_at, updated_at
			) VALUES (
			  $order_tx_sig, $buyer, $nft_id, $price, $quantity,
			  $payment_tx_sig, $payment_output_index, $payment_amount, $payment_utxo_slip,
			  $block_id_received, $block_hash_received, $transaction_id_received, $longest_chain_received,
			  $settlement_tx_sig,
			  $block_id_fulfilled, $block_hash_fulfilled, $transaction_id_fulfilled, $longest_chain_fulfilled,
			  $attempts, $status,
			  $created_at, $updated_at
			)`,
			order,
			this.dbname
		);
	}

	async updateOrder(order_id, fields = {}, now = Date.now()) {
		const allowed = [
			'settlement_tx_sig',
			'block_id_fulfilled',
			'block_hash_fulfilled',
			'transaction_id_fulfilled',
			'longest_chain_fulfilled',
			'longest_chain_received',
			'attempts',
			'status'
		];
		const sets = [];
		const params = { $id: Number(order_id), $updated_at: now };

		for (const key of allowed) {
			if (fields[key] === undefined) {
				continue;
			}
			sets.push(`${key} = $${key}`);
			params[`$${key}`] = fields[key];
		}

		if (!sets.length) {
			return;
		}

		sets.push('updated_at = $updated_at');
		await this.app.storage.runDatabase(
			`UPDATE orders SET ${sets.join(', ')} WHERE id = $id`,
			params,
			this.dbname
		);
	}

	async incrementOrderAttempts(order_id, now = Date.now()) {
		await this.app.storage.runDatabase(
			`UPDATE orders SET attempts = attempts + 1, updated_at = $updated_at WHERE id = $id`,
			{ $id: Number(order_id), $updated_at: now },
			this.dbname
		);

		const res = await this.app.storage.queryDatabase(
			`SELECT attempts FROM orders WHERE id = $id LIMIT 1`,
			{ $id: Number(order_id) },
			this.dbname
		);
		return Number(res?.[0]?.attempts ?? 0);
	}

	async returnOrderByTxSig(order_tx_sig) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM orders WHERE order_tx_sig = $order_tx_sig LIMIT 1`,
			{ $order_tx_sig: order_tx_sig },
			this.dbname
		);
		return res?.[0] || null;
	}

	async returnOrderBySettlementSig(settlement_tx_sig) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM orders WHERE settlement_tx_sig = $settlement_tx_sig LIMIT 1`,
			{ $settlement_tx_sig: settlement_tx_sig },
			this.dbname
		);
		return res?.[0] || null;
	}

	async returnPendingOrders() {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM orders
				 WHERE status IN ('pending', 'settling')
				   AND longest_chain_received = 1
				 ORDER BY id ASC`,
				{},
				this.dbname
			);
		} catch (err) {
			console.log('Store Database: returnPendingOrders failed', err?.message);
			return [];
		}
	}

	async returnOrphanedSettlingOrders() {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM orders
				 WHERE status = 'settling'
				   AND longest_chain_received = 1
				   AND block_id_fulfilled > 0
				   AND longest_chain_fulfilled = 0`,
				{},
				this.dbname
			);
		} catch (err) {
			return [];
		}
	}

	async returnOrphanedFulfilledOrders() {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM orders
				 WHERE status = 'fulfilled'
				   AND longest_chain_received = 1
				   AND block_id_fulfilled > 0
				   AND longest_chain_fulfilled = 0`,
				{},
				this.dbname
			);
		} catch (err) {
			return [];
		}
	}

	async updateOrdersReceivedChainState(block_id, block_hash, longest_chain) {
		await this.app.storage.runDatabase(
			`UPDATE orders SET longest_chain_received = $longest_chain, updated_at = $updated_at
			 WHERE block_id_received = $block_id AND block_hash_received = $block_hash`,
			{
				$block_id: Number(block_id) || 0,
				$block_hash: String(block_hash || ''),
				$longest_chain: longest_chain ? 1 : 0,
				$updated_at: Date.now()
			},
			this.dbname
		);
	}

	async updateOrdersFulfilledChainState(block_id, block_hash, longest_chain) {
		await this.app.storage.runDatabase(
			`UPDATE orders SET longest_chain_fulfilled = $longest_chain, updated_at = $updated_at
			 WHERE block_id_fulfilled = $block_id AND block_hash_fulfilled = $block_hash`,
			{
				$block_id: Number(block_id) || 0,
				$block_hash: String(block_hash || ''),
				$longest_chain: longest_chain ? 1 : 0,
				$updated_at: Date.now()
			},
			this.dbname
		);
	}

	// --- transaction archive ---

	async insertTransaction(tx, app, chain = {}) {
		if (!tx?.signature) {
			return;
		}

		const serialized = tx.serialize_to_web(app);
		try {
			await this.app.storage.runDatabase(
				`INSERT INTO transactions (signature, tx, onchain, block_id, block_hash, transaction_id, created_at)
				 VALUES ($signature, $tx, $onchain, $block_id, $block_hash, $transaction_id, $created_at)`,
				{
					$signature: tx.signature,
					$tx: JSON.stringify(serialized),
					$onchain: chain.onchain ?? 1,
					$block_id: chain.block_id ?? 0,
					$block_hash: chain.block_hash || '',
					$transaction_id: chain.transaction_id ?? 0,
					$created_at: Date.now()
				},
				this.dbname
			);
		} catch (err) {
			if (!String(err?.message || err).includes('UNIQUE')) {
				throw err;
			}
		}
	}

	async returnTransaction(signature, app) {
		if (!signature) {
			return null;
		}

		try {
			const res = await this.app.storage.queryDatabase(
				`SELECT tx FROM transactions WHERE signature = $signature AND onchain = $onchain LIMIT 1`,
				{ $signature: signature, $onchain: 1 },
				this.dbname
			);
			if (!res?.length || !res[0]?.tx) {
				return null;
			}

			let raw = res[0].tx;
			if (typeof raw === 'string') {
				raw = JSON.parse(raw);
			}

			const tx = new Transaction();
			tx.deserialize_from_web(app, raw);
			return tx;
		} catch (err) {
			return null;
		}
	}

	async updateTransactionsChainState(block_id, block_hash, onchain) {
		await this.app.storage.runDatabase(
			`UPDATE transactions SET onchain = $onchain WHERE block_id = $block_id AND block_hash = $block_hash`,
			{
				$block_id: Number(block_id) || 0,
				$block_hash: String(block_hash || ''),
				$onchain: onchain ? 1 : 0
			},
			this.dbname
		);
	}
}

module.exports = Database;
