const Transaction = require('../../../lib/saito/transaction').default;

class Database {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	get dbname() {
		return this.mod.dbname;
	}

	// --- listings (authoritative: one row per deposited NFT position) ---

	async insertListingRow(row) {
		await this.app.storage.runDatabase(
			`INSERT INTO listings (
			  signature, nft_id, seller, quantity, price,
			  access_hash, access_script, p2sh_address,
			  block_id, block_hash, transaction_id, slip_id,
			  longest_chain, on_chain, spent,
			  utxo_slip1, utxo_slip2, utxo_slip3,
			  created_at, updated_at
			) VALUES (
			  $signature, $nft_id, $seller, $quantity, $price,
			  $access_hash, $access_script, $p2sh_address,
			  $block_id, $block_hash, $transaction_id, $slip_id,
			  $longest_chain, $on_chain, $spent,
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
				$block_id: row.block_id ?? 0,
				$block_hash: row.block_hash || '',
				$transaction_id: row.transaction_id ?? 0,
				$slip_id: row.slip_id ?? 0,
				$longest_chain: row.longest_chain ?? 1,
				$on_chain: row.on_chain ?? 1,
				$spent: row.spent ?? 0,
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

	async returnActiveListingForBucket(nft_id, price) {
		try {
			const res = await this.app.storage.queryDatabase(
				`SELECT * FROM listings
				 WHERE nft_id = $nft_id AND price = $price
				   AND on_chain = 1 AND spent = 0 AND longest_chain = 1
				 ORDER BY created_at ASC
				 LIMIT 1`,
				{ $nft_id: nft_id, $price: Number(price) },
				this.dbname
			);
			return res?.[0] || null;
		} catch (err) {
			return null;
		}
	}

	async returnAllActiveListingRows() {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM listings
				 WHERE on_chain = 1 AND spent = 0 AND longest_chain = 1
				 ORDER BY created_at ASC`,
				{},
				this.dbname
			);
		} catch (err) {
			return [];
		}
	}

	async markListingSpent(signature, now) {
		await this.app.storage.runDatabase(
			`UPDATE listings SET spent = 1, updated_at = $updated_at WHERE signature = $signature`,
			{ $signature: signature, $updated_at: now },
			this.dbname
		);
	}

	async updateListingsChainState(block_id, block_hash, longest_chain) {
		await this.app.storage.runDatabase(
			`UPDATE listings SET longest_chain = $longest_chain
			 WHERE block_id = $block_id AND block_hash = $block_hash`,
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
				 WHERE on_chain = 1 AND spent = 0 AND longest_chain = 1
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

	// --- orders (escrowed payment UTXOs) ---

	async insertOrder(order) {
		await this.app.storage.runDatabase(
			`INSERT INTO orders (
			  order_tx_sig, buyer, nft_id, price,
			  payment_tx_sig, payment_output_index, payment_amount,
			  block_id_added, block_hash_added, transaction_id_added, longest_chain_added,
			  settlement_tx_sig,
			  block_id_fulfilled, block_hash_fulfilled, transaction_id_fulfilled, longest_chain_fulfilled,
			  created_at, updated_at
			) VALUES (
			  $order_tx_sig, $buyer, $nft_id, $price,
			  $payment_tx_sig, $payment_output_index, $payment_amount,
			  $block_id_added, $block_hash_added, $transaction_id_added, $longest_chain_added,
			  $settlement_tx_sig,
			  $block_id_fulfilled, $block_hash_fulfilled, $transaction_id_fulfilled, $longest_chain_fulfilled,
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
			'longest_chain_added'
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

	async returnOrderByTxSig(order_tx_sig) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM orders WHERE order_tx_sig = $order_tx_sig LIMIT 1`,
			{ $order_tx_sig: order_tx_sig },
			this.dbname
		);
		return res?.[0] || null;
	}

	async returnOpenOrders() {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM orders
				 WHERE longest_chain_added = 1
				   AND longest_chain_fulfilled = 0
				 ORDER BY id ASC`,
				{},
				this.dbname
			);
		} catch (err) {
			console.log('Store Database: returnOpenOrders failed', err?.message);
			return [];
		}
	}

	async updateOrdersAddedChainState(block_id, block_hash, longest_chain) {
		await this.app.storage.runDatabase(
			`UPDATE orders SET longest_chain_added = $longest_chain, updated_at = $updated_at
			 WHERE block_id_added = $block_id AND block_hash_added = $block_hash`,
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
