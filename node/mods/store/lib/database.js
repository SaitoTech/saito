const Transaction = require('../../../lib/saito/transaction').default;

const ORDER_STATUS_PENDING = 0;
const ORDER_STATUS_SENDING = 1;
const ORDER_STATUS_COMPLETE = 2;
const ORDER_STATUS_FAILED = 3;

const ORDER_MAX_RETRIES = 50;

class Database {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	get dbname() {
		return this.mod.dbname;
	}

	// --- listings (derived aggregate) ---

	async clearListings() {
		await this.app.storage.runDatabase(`DELETE FROM listings`, {}, this.dbname);
	}

	async insertListing(listing) {
		const res = await this.app.storage.runDatabase(
			`INSERT INTO listings (
			  nft_id, price, title, description, image,
			  quantity_available, quantity_pending, quantity_sold, updated_at
			) VALUES (
			  $nft_id, $price, $title, $description, $image,
			  $quantity_available, $quantity_pending, $quantity_sold, $updated_at
			)`,
			{
				$nft_id: listing.nft_id,
				$price: Number(listing.price ?? 0),
				$title: listing.title || '',
				$description: listing.description || '',
				$image: listing.image ?? null,
				$quantity_available: Number(listing.quantity_available ?? 0),
				$quantity_pending: Number(listing.quantity_pending ?? 0),
				$quantity_sold: Number(listing.quantity_sold ?? 0),
				$updated_at: listing.updated_at ?? Date.now()
			},
			this.dbname
		);
		return res;
	}

	async returnListing(listing_id) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM listings WHERE id = $id LIMIT 1`,
			{ $id: Number(listing_id) },
			this.dbname
		);
		return res?.[0] || null;
	}

	async returnListingByBucket(nft_id, price) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM listings WHERE nft_id = $nft_id AND price = $price LIMIT 1`,
			{ $nft_id: nft_id, $price: Number(price) },
			this.dbname
		);
		return res?.[0] || null;
	}

	async loadListings(limit = 100) {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM listings
				 WHERE quantity_available > 0 OR quantity_pending > 0
				 ORDER BY updated_at DESC
				 LIMIT $limit`,
				{ $limit: limit },
				this.dbname
			);
		} catch (err) {
			console.log('Store Database: loadListings failed', err?.message);
			return [];
		}
	}

	async updateListingQuantities(listing_id, { quantity_available, quantity_pending, quantity_sold }, now) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET quantity_available = $quantity_available,
			     quantity_pending = $quantity_pending,
			     quantity_sold = $quantity_sold,
			     updated_at = $updated_at
			 WHERE id = $id`,
			{
				$id: Number(listing_id),
				$quantity_available: Number(quantity_available ?? 0),
				$quantity_pending: Number(quantity_pending ?? 0),
				$quantity_sold: Number(quantity_sold ?? 0),
				$updated_at: now
			},
			this.dbname
		);
	}

	async deleteListing(listing_id) {
		await this.app.storage.runDatabase(
			`DELETE FROM listings WHERE id = $id`,
			{ $id: Number(listing_id) },
			this.dbname
		);
	}

	async scanInventoryForRebuild() {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT nft_id, price, SUM(quantity) AS total_quantity
				 FROM inventory
				 WHERE on_chain = 1 AND spent = 0
				 GROUP BY nft_id, price`,
				{},
				this.dbname
			);
		} catch (err) {
			console.log('Store Database: scanInventoryForRebuild failed', err?.message);
			return [];
		}
	}

	async returnInventoryMetadataSample(nft_id, price) {
		const res = await this.app.storage.queryDatabase(
			`SELECT seller FROM inventory
			 WHERE nft_id = $nft_id AND price = $price AND on_chain = 1 AND spent = 0
			 ORDER BY updated_at DESC LIMIT 1`,
			{ $nft_id: nft_id, $price: Number(price) },
			this.dbname
		);
		return res?.[0] || null;
	}

	async incrementListingSold(nft_id, price, quantity, now) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET quantity_sold = quantity_sold + $quantity, updated_at = $updated_at
			 WHERE nft_id = $nft_id AND price = $price`,
			{
				$nft_id: nft_id,
				$price: Number(price),
				$quantity: Number(quantity) || 1,
				$updated_at: now
			},
			this.dbname
		);
	}

	async loadAllListings() {
		try {
			return await this.app.storage.queryDatabase(`SELECT * FROM listings`, {}, this.dbname);
		} catch (err) {
			return [];
		}
	}

	async adjustListingExpectations(listing_id, available_delta, pending_delta, now) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET quantity_available = quantity_available + $available_delta,
			     quantity_pending = quantity_pending + $pending_delta,
			     updated_at = $updated_at
			 WHERE id = $id
			   AND quantity_available + $available_delta >= 0
			   AND quantity_pending + $pending_delta >= 0`,
			{
				$id: Number(listing_id),
				$available_delta: Number(available_delta),
				$pending_delta: Number(pending_delta),
				$updated_at: now
			},
			this.dbname
		);
	}

	// --- inventory (authoritative) ---

	async insertInventory(inventory) {
		await this.app.storage.runDatabase(
			`INSERT INTO inventory (
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
				$signature: inventory.signature,
				$nft_id: inventory.nft_id,
				$seller: inventory.seller || '',
				$quantity: Number(inventory.quantity ?? 1),
				$price: Number(inventory.price ?? 0),
				$access_hash: inventory.access_hash || '',
				$access_script: inventory.access_script || '',
				$p2sh_address: inventory.p2sh_address || '',
				$block_id: inventory.block_id ?? 0,
				$block_hash: inventory.block_hash || '',
				$transaction_id: inventory.transaction_id ?? 0,
				$slip_id: inventory.slip_id ?? 0,
				$longest_chain: inventory.longest_chain ?? 1,
				$on_chain: inventory.on_chain ?? 1,
				$spent: inventory.spent ?? 0,
				$utxo_slip1: inventory.utxo_slip1 || '',
				$utxo_slip2: inventory.utxo_slip2 || '',
				$utxo_slip3: inventory.utxo_slip3 || '',
				$created_at: inventory.created_at,
				$updated_at: inventory.updated_at
			},
			this.dbname
		);
	}

	async returnInventory(signature) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM inventory WHERE signature = $signature LIMIT 1`,
			{ $signature: signature },
			this.dbname
		);
		return res?.[0] || null;
	}

	async returnActiveInventoryForBucket(nft_id, price) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM inventory
			 WHERE nft_id = $nft_id AND price = $price
			   AND on_chain = 1 AND spent = 0 AND longest_chain = 1
			 ORDER BY created_at DESC LIMIT 1`,
			{ $nft_id: nft_id, $price: Number(price) },
			this.dbname
		);
		return res?.[0] || null;
	}

	async returnAllActiveInventory() {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM inventory
				 WHERE on_chain = 1 AND spent = 0 AND longest_chain = 1
				 ORDER BY created_at ASC`,
				{},
				this.dbname
			);
		} catch (err) {
			return [];
		}
	}

	async markInventorySpent(signature, now) {
		await this.app.storage.runDatabase(
			`UPDATE inventory SET spent = 1, updated_at = $updated_at WHERE signature = $signature`,
			{ $signature: signature, $updated_at: now },
			this.dbname
		);
	}

	async updateInventoryChainState(block_id, block_hash, longest_chain) {
		const params = {
			$block_id: Number(block_id) || 0,
			$block_hash: String(block_hash || ''),
			$longest_chain: longest_chain ? 1 : 0
		};

		await this.app.storage.runDatabase(
			`UPDATE inventory SET longest_chain = $longest_chain
			 WHERE block_id = $block_id AND block_hash = $block_hash`,
			params,
			this.dbname
		);

		return params;
	}

	// --- orders ---

	async insertOrder(order) {
		await this.app.storage.runDatabase(
			`INSERT INTO sales (
			  signature, buyer, seller, listing_id, quantity,
			  price, fee, refund, status, on_chain,
			  outbound_tx, retry_count, last_attempt,
			  block_id, block_hash, transaction_id, created_at, updated_at
			) VALUES (
			  $signature, $buyer, $seller, $listing_id, $quantity,
			  $price, $fee, $refund, $status, $on_chain,
			  $outbound_tx, $retry_count, $last_attempt,
			  $block_id, $block_hash, $transaction_id, $created_at, $updated_at
			)`,
			order,
			this.dbname
		);
	}

	async returnPendingOrders(status) {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM sales WHERE status = $status AND on_chain = 1 ORDER BY id ASC`,
				{ $status: status },
				this.dbname
			);
		} catch (err) {
			console.log('Store Database: returnPendingOrders failed', err?.message);
			return [];
		}
	}

	async returnOrder(signature) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM sales WHERE signature = $signature LIMIT 1`,
			{ $signature: signature },
			this.dbname
		);
		return res?.[0] || null;
	}

	async updateOrderSending(order_id, outbound_tx, now, status) {
		await this.app.storage.runDatabase(
			`UPDATE sales SET status = $status, outbound_tx = $outbound_tx, last_attempt = $last_attempt, updated_at = $updated_at WHERE id = $id`,
			{
				$id: order_id,
				$status: status,
				$outbound_tx: outbound_tx,
				$last_attempt: now,
				$updated_at: now
			},
			this.dbname
		);
	}

	async updateOrderComplete(order_id, outbound_tx, now, status) {
		await this.app.storage.runDatabase(
			`UPDATE sales SET status = $status, outbound_tx = $outbound_tx, updated_at = $updated_at WHERE id = $id`,
			{
				$id: order_id,
				$status: status,
				$outbound_tx: outbound_tx,
				$updated_at: now
			},
			this.dbname
		);
	}

	async returnOrderRetryCount(order_id) {
		const res = await this.app.storage.queryDatabase(
			`SELECT retry_count FROM sales WHERE id = $id LIMIT 1`,
			{ $id: order_id },
			this.dbname
		);
		return Number(res?.[0]?.retry_count || 0);
	}

	async updateOrderRetry(order_id, retry_count, now) {
		await this.app.storage.runDatabase(
			`UPDATE sales SET retry_count = $retry_count, last_attempt = $last_attempt, updated_at = $updated_at WHERE id = $id`,
			{
				$id: order_id,
				$retry_count: retry_count,
				$last_attempt: now,
				$updated_at: now
			},
			this.dbname
		);
	}

	async updateOrderFailed(order_id, now, status) {
		await this.app.storage.runDatabase(
			`UPDATE sales SET status = $status, updated_at = $updated_at WHERE id = $id`,
			{ $id: order_id, $status: status, $updated_at: now },
			this.dbname
		);
	}

	async updateSalesChainState(block_id, block_hash, on_chain) {
		await this.app.storage.runDatabase(
			`UPDATE sales SET on_chain = $on_chain WHERE block_id = $block_id AND block_hash = $block_hash`,
			{
				$block_id: Number(block_id) || 0,
				$block_hash: String(block_hash || ''),
				$on_chain: on_chain ? 1 : 0
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
module.exports.ORDER_STATUS_PENDING = ORDER_STATUS_PENDING;
module.exports.ORDER_STATUS_SENDING = ORDER_STATUS_SENDING;
module.exports.ORDER_STATUS_COMPLETE = ORDER_STATUS_COMPLETE;
module.exports.ORDER_STATUS_FAILED = ORDER_STATUS_FAILED;
module.exports.ORDER_MAX_RETRIES = ORDER_MAX_RETRIES;
