const Listing = require('./listing');
const Database = require('./database');
const {
	ORDER_STATUS_PENDING,
	ORDER_STATUS_SENDING,
	ORDER_STATUS_COMPLETE,
	ORDER_STATUS_FAILED,
	ORDER_MAX_RETRIES
} = Database;
const { syncListingCache } = require('./ui/listing-cache');
const Inventory = require('./inventory');
const Sale = require('./sale');
const {
	findInventoryTriple,
	anchorInventoryInputs,
	inventoryInputsFromRecord,
	enrichInventoryFromTransaction,
	serializeAnchoredInventorySlips,
	returnChainLocation,
	returnInventorySlipId,
	slipPublicKey
} = require('./helpers');
const { initializeImageCache } = require('./images');
const { executeListingScript, returnP2SHTuples } = require('./scripting');
const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');

class Warehouse {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.db = new Database(app, mod);
		this.listings = {};
		this.inventory = {};
	}

	async initialize() {
		if (this.app.BROWSER) {
			return;
		}

		this.mod.listings = {};
		await this.rebuildListings();
		await initializeImageCache(this.mod);
	}

	async onNewBlock(blk, lc) {
		await this.processOrder();
	}

	async onChainReorganization(block_id, block_hash, longest_chain) {
		await this.db.updateInventoryChainState(block_id, block_hash, longest_chain);
		await this.db.updateSalesChainState(block_id, block_hash, longest_chain);
		await this.db.updateTransactionsChainState(block_id, block_hash, longest_chain);

		for (const row of Object.values(this.inventory)) {
			if (
				Number(row.block_id) === Number(block_id) &&
				String(row.block_hash || '') === String(block_hash || '')
			) {
				row.longest_chain = longest_chain ? 1 : 0;
			}
		}

		await this.rebuildListings();
	}

	async rebuildListings() {
		const buckets = await this.db.scanInventoryForRebuild();
		const existing = await this.db.loadAllListings();
		const existing_by_bucket = {};

		for (const row of existing || []) {
			existing_by_bucket[`${row.nft_id}:${row.price}`] = row;
		}

		await this.db.clearListings();
		this.listings = {};

		const now = Date.now();

		for (const bucket of buckets || []) {
			const nft_id = bucket.nft_id;
			const price = Number(bucket.price ?? 0);
			const key = `${nft_id}:${price}`;
			const prev = existing_by_bucket[key] || {};
			const listing = new Listing(this.app, this.mod, {
				nft_id,
				price,
				title: prev.title || '',
				description: prev.description || '',
				image: prev.image ?? null,
				quantity_available: Number(bucket.total_quantity ?? 0),
				quantity_pending: Number(prev.quantity_pending ?? 0),
				quantity_sold: Number(prev.quantity_sold ?? 0),
				updated_at: now
			});

			await this.db.insertListing(listing);
			const row = await this.db.returnListingByBucket(nft_id, price);
			if (row) {
				listing.id = row.id;
				this.listings[listing.id] = listing;
				syncListingCache(this.mod, listing);
			}
		}

		this.mod.listings = this.listings;
	}

	async addListing(nft, tx, txmsg) {
		if (this.app.BROWSER || !tx?.signature) {
			return;
		}

		if (await this.db.returnInventory(tx.signature)) {
			return;
		}

		const access_script = txmsg.access_script || '';
		if (!(await executeListingScript(this.app, access_script, this.mod.store_public_key))) {
			return;
		}

		const observation = this.observeInventoryPosition(nft, tx, txmsg);
		if (!observation) {
			return;
		}

		const inventory = new Inventory(observation);
		this.inventory[inventory.signature] = inventory;

		try {
			await this.db.insertInventory(inventory);
		} catch (err) {
			if (String(err?.message || err).includes('UNIQUE')) {
				return;
			}
			throw err;
		}

		await this.rebuildListings();

		const listing = await this.db.returnListingByBucket(inventory.nft_id, inventory.price);
		const image = nft.returnImage?.() || '';
		if (image && listing?.id) {
			this.mod.image_cache[listing.id] = image;
		}
	}

	async removeListing(nft, tx, txmsg) {
		if (this.app.BROWSER || !tx) {
			return;
		}

		const spent_rows = await this.matchSpentInventory(tx);
		if (!spent_rows.length) {
			return;
		}

		const now = Date.now();

		for (const row of spent_rows) {
			await this.db.markInventorySpent(row.signature, now);
			delete this.inventory[row.signature];
			await this.db.incrementListingSold(row.nft_id, row.price, row.quantity, now);
		}

		await this.rebuildListings();
	}

	async processOrder() {
		if (this.app.BROWSER) {
			return;
		}

		const orders = await this.db.returnPendingOrders(ORDER_STATUS_PENDING);
		if (!orders?.length) {
			return;
		}

		for (const row of orders) {
			const order = new Sale(row);
			if (order.outbound_tx) {
				continue;
			}

			const listing = await this.returnListing(order.listing_id);
			const quantity = Number(order.quantity) || 1;
			const unit_price = BigInt(this.app.wallet.convertSaitoToNolan(order.price) ?? 0);
			const now = Date.now();
			let reject_reason = '';

			if (!listing || !listing.isActive()) {
				reject_reason = 'listing inactive or missing';
			} else if (Number(listing.quantity_available || 0) < quantity) {
				reject_reason = 'insufficient available quantity';
			} else if (unit_price < BigInt(listing.price ?? 0)) {
				reject_reason = 'purchase price below listing price';
			}

			let inventory = reject_reason
				? null
				: await this.db.returnActiveInventoryForBucket(listing.nft_id, listing.price);
			let inventory_tx = null;
			let inventory_txmsg = {};
			let inventory_inputs = inventory ? inventoryInputsFromRecord(inventory) : null;
			const access_script = inventory?.access_script || '';

			if (!reject_reason && !inventory) {
				reject_reason = 'active inventory position not found';
			}

			if (!reject_reason && !access_script) {
				reject_reason = 'inventory access_script missing';
			}

			if (!reject_reason && !inventory_inputs) {
				inventory_tx = await this.returnTransaction(inventory.signature);
				if (!inventory_tx) {
					reject_reason = 'inventory transaction not found';
				} else {
					inventory_txmsg = inventory_tx.returnMessage?.() || {};
					inventory = enrichInventoryFromTransaction(inventory, inventory_txmsg);
					inventory_inputs = inventoryInputsFromRecord(inventory);
					const script_address = inventory?.p2sh_address || inventory_txmsg?.p2sh_address || '';
					const slip_public_key = slipPublicKey(this.app, script_address);
					if (!inventory_inputs && script_address) {
						const anchored = anchorInventoryInputs(inventory_tx, slip_public_key, {
							block_id: inventory.block_id,
							transaction_id: inventory.transaction_id
						});
						if (anchored) {
							inventory_inputs = anchored;
						}
					}
					if (!inventory_inputs && !findInventoryTriple(inventory_tx.to, slip_public_key)) {
						reject_reason = 'inventory triple not found in transaction';
					}
				}
			}

			if (
				!reject_reason &&
				access_script &&
				!(await executeListingScript(this.app, access_script, this.mod.store_public_key))
			) {
				reject_reason = 'store cannot execute inventory script';
			}

			if (reject_reason) {
				console.log('Store: processOrder deferred', {
					order: order.signature,
					listing_id: order.listing_id,
					reason: reject_reason
				});
				await this.incrementOrderRetry(order, now);
				continue;
			}

			let outbound_tx = null;

			try {
				inventory.listing_id = listing.id;
				outbound_tx = this.mod.createFulfillmentTransaction({
					inventory,
					inventory_tx,
					inventory_txmsg,
					listing,
					sale: order,
					buyer: order.buyer,
					quantity
				});
			} catch (err) {
				console.warn('Store: processOrder outbound build failed', err?.message);
				await this.incrementOrderRetry(order, now);
				continue;
			}

			const nft_source_tx =
				inventory_tx || (await this.returnTransaction(inventory.signature));
			if (nft_source_tx && listing?.id) {
				const nft = new SaitoNFT(this.app, this.mod, nft_source_tx, null);
				const nft_image = nft.returnImage?.() || '';
				if (nft_image) {
					this.mod.image_cache[listing.id] = nft_image;
				}
			}

			await outbound_tx.sign();
			await this.db.adjustListingExpectations(listing.id, -quantity, quantity, now);

			const cached = this.listings[listing.id];
			if (cached) {
				cached.quantity_available = Math.max(0, Number(cached.quantity_available) - quantity);
				cached.quantity_pending = Number(cached.quantity_pending) + quantity;
				cached.updated_at = now;
				syncListingCache(this.mod, cached);
			}

			await this.db.updateOrderSending(order.id, outbound_tx.signature, now, ORDER_STATUS_SENDING);
			await this.insertTransaction(outbound_tx, { onchain: 1 });

			console.log('Store: processOrder propagating outbound tx', outbound_tx.signature);
			this.app.network.propagateTransaction(outbound_tx);
			break;
		}
	}

	observeInventoryPosition(nft, tx, txmsg) {
		const tuples = returnP2SHTuples(tx);
		if (!tuples.outputs?.length) {
			return null;
		}

		const script_address = txmsg.p2sh_address || '';
		const slip_key = slipPublicKey(this.app, script_address);
		const chain = returnChainLocation(null, tx);
		const utxo_slips = serializeAnchoredInventorySlips(tx, slip_key, chain);

		if (!utxo_slips) {
			return null;
		}

		const meta = txmsg.listing || {};
		const price_nolan = Number(this.app.wallet.convertSaitoToNolan(meta.price ?? 0) ?? 0);

		return {
			signature: tx.signature,
			nft_id: String(nft.id || nft.uuid || meta.nft_id || ''),
			seller: tx.from?.[0]?.publicKey || '',
			quantity: Number(nft.amount ?? tuples.outputs[0]?.slips?.[0]?.amount ?? 1) || 1,
			price: price_nolan,
			access_hash: txmsg.access_hash || '',
			access_script: txmsg.access_script || '',
			p2sh_address: script_address,
			block_id: chain.block_id,
			block_hash: chain.block_hash,
			transaction_id: chain.transaction_id,
			slip_id: returnInventorySlipId(tx, slip_key),
			longest_chain: 1,
			on_chain: 1,
			spent: 0,
			utxo_slip1: utxo_slips[0],
			utxo_slip2: utxo_slips[1],
			utxo_slip3: utxo_slips[2],
			created_at: Date.now(),
			updated_at: Date.now()
		};
	}

	async matchSpentInventory(tx) {
		const tuples = returnP2SHTuples(tx);
		if (!tuples.inputs?.length) {
			return [];
		}

		const rows = await this.db.returnAllActiveInventory();
		const spent = [];

		for (const row of rows || []) {
			let anchored = inventoryInputsFromRecord(row);
			if (!anchored) {
				const prior_tx = await this.returnTransaction(row.signature);
				if (!prior_tx) {
					continue;
				}
				const slip_key = slipPublicKey(this.app, row.p2sh_address);
				anchored = anchorInventoryInputs(prior_tx, slip_key, {
					block_id: row.block_id,
					transaction_id: row.transaction_id
				});
			}
			if (!anchored?.length) {
				continue;
			}

			const consumes = anchored.every((expected) =>
				(tx.from || []).some(
					(input) =>
						Number(input?.blockId ?? input?.block_id ?? 0) ===
							Number(expected.blockId ?? 0) &&
						Number(input?.txOrdinal ?? input?.tx_ordinal ?? 0) ===
							Number(expected.txOrdinal ?? 0) &&
						Number(input?.index ?? 0) === Number(expected.index ?? 0)
				)
			);

			if (consumes) {
				spent.push(row);
			}
		}

		return spent;
	}

	async incrementOrderRetry(order, now = Date.now()) {
		const retry_count = (await this.db.returnOrderRetryCount(order.id)) + 1;
		await this.db.updateOrderRetry(order.id, retry_count, now);
		if (retry_count >= ORDER_MAX_RETRIES) {
			await this.db.updateOrderFailed(order.id, now, ORDER_STATUS_FAILED);
		}
	}

	async refundBuyer(buyer, listing_id, amount, reason) {
		if (!buyer || !listing_id || amount <= 0n) {
			return;
		}

		console.warn('Store: refunding buyer', { buyer, listing_id, reason });
		try {
			const refund_tx = await this.mod.createRefundTransaction(buyer, listing_id, amount, reason);
			if (refund_tx) {
				this.app.network.propagateTransaction(refund_tx);
			}
		} catch (err) {
			console.warn('Store: refund failed', err?.message);
		}
	}

	async addOrder(sale) {
		const params = sale instanceof Sale ? sale.toInsertParams() : sale;
		await this.db.insertOrder(params);
	}

	async returnListing(listing_id) {
		if (this.listings[listing_id]) {
			return this.listings[listing_id];
		}

		try {
			const row = await this.db.returnListing(listing_id);
			if (!row) {
				return null;
			}

			const listing = new Listing(this.app, this.mod, row);
			this.listings[listing.id] = listing;
			syncListingCache(this.mod, listing);
			return listing;
		} catch (err) {
			return null;
		}
	}

	returnListings() {
		return Object.values(this.listings);
	}

	returnActiveListings() {
		return this.returnListings().filter((listing) => listing.isActive());
	}

	async returnActiveInventory(listing_id) {
		const listing = await this.returnListing(listing_id);
		if (!listing) {
			return null;
		}

		const row = await this.db.returnActiveInventoryForBucket(listing.nft_id, listing.price);
		if (!row) {
			return null;
		}

		return new Inventory(row);
	}

	async insertTransaction(tx, chain = {}) {
		await this.db.insertTransaction(tx, this.app, chain);
	}

	async returnTransaction(signature) {
		return this.db.returnTransaction(signature, this.app);
	}
}

module.exports = Warehouse;
module.exports.ORDER_STATUS_PENDING = ORDER_STATUS_PENDING;
module.exports.ORDER_STATUS_SENDING = ORDER_STATUS_SENDING;
module.exports.ORDER_STATUS_COMPLETE = ORDER_STATUS_COMPLETE;
module.exports.ORDER_STATUS_FAILED = ORDER_STATUS_FAILED;
module.exports.ORDER_MAX_RETRIES = ORDER_MAX_RETRIES;
