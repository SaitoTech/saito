const Transaction = require('../../../lib/saito/transaction').default;

const INVENTORY_STATUS_ACTIVE = 1;
const INVENTORY_STATUS_SPENT = 2;

const SALE_STATUS_PENDING = 0;
const SALE_STATUS_FULFILLING = 1;
const SALE_STATUS_FINALIZED = 2;
const SALE_STATUS_FAILED = 3;

class Database {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	get dbname() {
		return this.mod.dbname;
	}

	async loadActiveListings(limit, status) {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM listings
				 WHERE status = $status AND quantity_available > 0
				 ORDER BY created_at DESC
				 LIMIT $limit`,
				{ $status: status, $limit: limit },
				this.dbname
			);
		} catch (err) {
			console.log('Store Database: loadActiveListings failed', err?.message);
			return [];
		}
	}

	async insertListing(listing) {
		try {
			await this.app.storage.runDatabase(
				`INSERT INTO listings (
				  id, nft_id, seller, title, description, image,
				  price, quantity_total, quantity_available, quantity_reserved,
				  status, created_at, updated_at
				) VALUES (
				  $id, $nft_id, $seller, $title, $description, $image,
				  $price, $quantity_total, $quantity_available, $quantity_reserved,
				  $status, $created_at, $updated_at
				)`,
				{
					$id: listing.id,
					$nft_id: listing.nft_id,
					$seller: listing.seller,
					$title: listing.title,
					$description: listing.description,
					$image: listing.image,
					$price: Number(listing.price ?? 0),
					$quantity_total: listing.quantity_total,
					$quantity_available: listing.quantity_available,
					$quantity_reserved: listing.quantity_reserved ?? 0,
					$status: listing.status,
					$created_at: listing.created_at,
					$updated_at: listing.updated_at
				},
				this.dbname
			);
		} catch (err) {
			if (!String(err?.message || err).includes('UNIQUE')) {
				throw err;
			}
		}
	}

	async returnListing(listing_id) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM listings WHERE id = $id LIMIT 1`,
			{ $id: listing_id },
			this.dbname
		);
		return res?.[0] || null;
	}

	async reserveListing(listing_id, quantity, now) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET quantity_available = quantity_available - $quantity,
			     quantity_reserved = quantity_reserved + $quantity,
			     updated_at = $updated_at
			 WHERE id = $id
			   AND quantity_available >= $quantity`,
			{ $id: listing_id, $quantity: quantity, $updated_at: now },
			this.dbname
		);

		const res = await this.app.storage.queryDatabase(
			`SELECT quantity_available, quantity_reserved FROM listings WHERE id = $id LIMIT 1`,
			{ $id: listing_id },
			this.dbname
		);
		return res?.[0] || null;
	}

	async releaseReservation(listing_id, quantity, now) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET quantity_reserved = quantity_reserved - $quantity,
			     updated_at = $updated_at
			 WHERE id = $id
			   AND quantity_reserved >= $quantity`,
			{ $id: listing_id, $quantity: quantity, $updated_at: now },
			this.dbname
		);
	}

	async restoreReservation(listing_id, quantity, now) {
		await this.app.storage.runDatabase(
			`UPDATE listings
			 SET quantity_available = quantity_available + $quantity,
			     quantity_reserved = quantity_reserved - $quantity,
			     updated_at = $updated_at
			 WHERE id = $id
			   AND quantity_reserved >= $quantity`,
			{ $id: listing_id, $quantity: quantity, $updated_at: now },
			this.dbname
		);
	}

	async insertInventory(inventory) {
		await this.app.storage.runDatabase(
			`INSERT INTO inventory (
			  signature, listing_id, nft_id, quantity, status, onchain,
			  block_id, block_hash, transaction_id, slip_id,
			  access_hash, access_script, utxo_slip1, utxo_slip2, utxo_slip3,
			  created_at, updated_at
			) VALUES (
			  $signature, $listing_id, $nft_id, $quantity, $status, $onchain,
			  $block_id, $block_hash, $transaction_id, $slip_id,
			  $access_hash, $access_script, $utxo_slip1, $utxo_slip2, $utxo_slip3,
			  $created_at, $updated_at
			)`,
			{
				$signature: inventory.signature,
				$listing_id: inventory.listing_id,
				$nft_id: inventory.nft_id,
				$quantity: inventory.quantity,
				$status: inventory.status,
				$onchain: inventory.onchain ?? 1,
				$block_id: inventory.block_id ?? 0,
				$block_hash: inventory.block_hash || '',
				$transaction_id: inventory.transaction_id ?? 0,
				$slip_id: inventory.slip_id ?? 0,
				$access_hash: inventory.access_hash || '',
				$access_script: inventory.access_script || '',
				$utxo_slip1: inventory.utxo_slip1 || '',
				$utxo_slip2: inventory.utxo_slip2 || '',
				$utxo_slip3: inventory.utxo_slip3 || '',
				$created_at: inventory.created_at,
				$updated_at: inventory.updated_at
			},
			this.dbname
		);
	}

	async updateInventory(signature, status, now) {
		await this.app.storage.runDatabase(
			`UPDATE inventory SET status = $status, updated_at = $updated_at WHERE signature = $signature`,
			{ $signature: signature, $status: status, $updated_at: now },
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

	async returnActiveInventory(listing_id, status) {
		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM inventory
			 WHERE listing_id = $listing_id AND status = $status AND onchain = $onchain
			 ORDER BY created_at DESC LIMIT 1`,
			{ $listing_id: listing_id, $status: status, $onchain: 1 },
			this.dbname
		);
		return res?.[0] || null;
	}

	async insertOrder(order) {
		await this.app.storage.runDatabase(
			`INSERT INTO sales (
			  signature, buyer, seller, listing_id, quantity,
			  price, fee, refund, status, onchain,
			  fulfillment_tx, retry_count, last_attempt,
			  block_id, block_hash, transaction_id, created_at, updated_at
			) VALUES (
			  $signature, $buyer, $seller, $listing_id, $quantity,
			  $price, $fee, $refund, $status, $onchain,
			  $fulfillment_tx, $retry_count, $last_attempt,
			  $block_id, $block_hash, $transaction_id, $created_at, $updated_at
			)`,
			order,
			this.dbname
		);
	}

	async returnPendingOrders(status) {
		try {
			return await this.app.storage.queryDatabase(
				`SELECT * FROM sales WHERE status = $status AND onchain = $onchain ORDER BY id ASC`,
				{ $status: status, $onchain: 1 },
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

	async updateOrderFulfilling(order_id, fulfillment_tx, now, status) {
		await this.app.storage.runDatabase(
			`UPDATE sales SET status = $status, fulfillment_tx = $fulfillment_tx, last_attempt = $last_attempt, updated_at = $updated_at WHERE id = $id`,
			{
				$id: order_id,
				$status: status,
				$fulfillment_tx: fulfillment_tx,
				$last_attempt: now,
				$updated_at: now
			},
			this.dbname
		);
	}

	async updateOrderFinalized(order_id, fulfillment_tx, now, status) {
		await this.app.storage.runDatabase(
			`UPDATE sales SET status = $status, fulfillment_tx = $fulfillment_tx, updated_at = $updated_at WHERE id = $id`,
			{
				$id: order_id,
				$status: status,
				$fulfillment_tx: fulfillment_tx,
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

	async applyChainReorganization(block_id, block_hash, onchain) {
		const params = {
			$block_id: Number(block_id) || 0,
			$block_hash: String(block_hash || ''),
			$onchain: onchain ? 1 : 0
		};

		await this.app.storage.runDatabase(
			`UPDATE inventory SET onchain = $onchain WHERE block_id = $block_id AND block_hash = $block_hash`,
			params,
			this.dbname
		);
		await this.app.storage.runDatabase(
			`UPDATE sales SET onchain = $onchain WHERE block_id = $block_id AND block_hash = $block_hash`,
			params,
			this.dbname
		);
		await this.app.storage.runDatabase(
			`UPDATE transactions SET onchain = $onchain WHERE block_id = $block_id AND block_hash = $block_hash`,
			params,
			this.dbname
		);

		return params;
	}
}

module.exports = Database;
module.exports.INVENTORY_STATUS_ACTIVE = INVENTORY_STATUS_ACTIVE;
module.exports.INVENTORY_STATUS_SPENT = INVENTORY_STATUS_SPENT;
module.exports.SALE_STATUS_PENDING = SALE_STATUS_PENDING;
module.exports.SALE_STATUS_FULFILLING = SALE_STATUS_FULFILLING;
module.exports.SALE_STATUS_FINALIZED = SALE_STATUS_FINALIZED;
module.exports.SALE_STATUS_FAILED = SALE_STATUS_FAILED;
module.exports.SALE_MAX_RETRIES = 50;
