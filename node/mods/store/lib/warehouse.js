const Listing = require('./listing');
const { LISTING_STATUS_ACTIVE } = Listing;
const Database = require('./database');
const {
	INVENTORY_STATUS_ACTIVE,
	INVENTORY_STATUS_SPENT,
	SALE_STATUS_PENDING,
	SALE_STATUS_FULFILLING,
	SALE_STATUS_FINALIZED,
	SALE_STATUS_FAILED,
	SALE_MAX_RETRIES
} = Database;
const { syncListingCache, removeListingFromCache } = require('./ui/listing-cache');
const Inventory = require('./inventory');
const Sale = require('./sale');
const { findInventoryTriple, anchorInventoryInputs, inventoryInputsFromRecord, enrichInventoryFromTransaction, serializeAnchoredInventorySlips, returnChainLocation, returnInventorySlipId, slipPublicKey } = require('./helpers');
const { initializeImageCache } = require('./images');
const { executeListingScript } = require('./scripting');
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
		await this.loadActiveListings();
		await initializeImageCache(this.mod);
	}

	async onNewBlock(blk, lc) {
		await this.processPendingOrders();
	}

	async listAssetConsumesPriorInventory(tx, txmsg) {
		const prior_sig =
			txmsg.fulfill_sale?.prior_inventory || txmsg.fulfill_sale?.prior_listing || '';
		if (!prior_sig) {
			return false;
		}

		const inventory = await this.returnInventory(prior_sig);
		let anchored = inventory ? inventoryInputsFromRecord(inventory) : null;

		if (!anchored) {
			const prior_tx = await this.returnTransaction(prior_sig);
			if (!prior_tx) {
				return false;
			}
			const script_address =
				txmsg.listing?.pay_descriptor || inventory?.p2sh_address || '';
			const slip_key = slipPublicKey(this.app, script_address);
			if (!slip_key || !findInventoryTriple(prior_tx.to, slip_key)) {
				return false;
			}
			anchored = anchorInventoryInputs(prior_tx, slip_key, {
				block_id: inventory?.block_id,
				transaction_id: inventory?.transaction_id
			});
		}

		if (!anchored?.length) {
			return false;
		}

		const from = tx.from || [];
		const consumes = anchored.every((expected) =>
			from.some(
				(input) =>
					Number(input?.blockId ?? input?.block_id ?? 0) ===
						Number(expected.blockId ?? 0) &&
					Number(input?.txOrdinal ?? input?.tx_ordinal ?? 0) ===
						Number(expected.txOrdinal ?? 0) &&
					Number(input?.index ?? 0) === Number(expected.index ?? 0)
			)
		);
		if (!consumes) {
			return false;
		}

		const access_script = txmsg.access_script || inventory?.access_script || '';
		if (!access_script) {
			return false;
		}

		return executeListingScript(this.app, access_script, this.mod.store_public_key);
	}

	async finalizeSaleFromListAsset(tx, fulfill) {
		const sale_signature = fulfill?.sale_signature;
		if (!sale_signature) {
			return false;
		}

		const sale = await this.returnOrder(sale_signature);
		if (!sale) {
			return false;
		}

		if (Number(sale.status) === SALE_STATUS_FINALIZED) {
			return true;
		}

		if (Number(sale.status) !== SALE_STATUS_FULFILLING) {
			return false;
		}

		if (sale.fulfillment_tx && sale.fulfillment_tx !== tx.signature) {
			return false;
		}

		const listing_id = sale.listing_id;
		const quantity = Number(fulfill.quantity) || 1;
		const now = Date.now();

		await this.finalizeOrder(sale.id, tx.signature, listing_id, quantity, now);

		const listing = await this.returnListing(listing_id);
		const seller = sale.seller || listing?.seller;
		const payout_nolan =
			BigInt(this.app.wallet.convertSaitoToNolan(sale.price) ?? 0) * BigInt(quantity);

		if (seller && payout_nolan > 0n) {
			try {
				const payout_tx = await this.app.wallet.createUnsignedTransaction(
					seller,
					payout_nolan,
					BigInt(0)
				);
				payout_tx.msg = {
					module: 'Store',
					request: 'seller_payout',
					listing_id,
					sale_signature
				};
				await payout_tx.sign();
				this.app.network.propagateTransaction(payout_tx);
			} catch (err) {
				console.warn('Store: seller payout failed', err?.message);
			}
		}

		return true;
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

	async processPendingOrders() {
		if (this.app.BROWSER) {
			return;
		}

		const sales = await this.returnPendingOrders();

		if (!sales?.length) {
			return;
		}

		for (const sale of sales) {
			if (sale.fulfillment_tx) {
				continue;
			}

			const listing_id = sale.listing_id;
			const buyer = sale.buyer;
			const quantity = Number(sale.quantity) || 1;
			const unit_price = BigInt(this.app.wallet.convertSaitoToNolan(sale.price) ?? 0);
			const listing = await this.returnListing(listing_id);
			const now = Date.now();

			let reject_reason = '';

			if (!listing || !listing.isActive()) {
				reject_reason = 'listing inactive or missing';
			} else if (Number(listing.quantity_reserved || 0) < quantity) {
				reject_reason = 'insufficient reserved quantity';
			} else if (unit_price < BigInt(listing.price ?? 0)) {
				reject_reason = 'purchase price below listing price';
			}

			let inventory = reject_reason ? null : await this.returnActiveInventory(listing_id);
			let inventory_tx = null;
			let inventory_txmsg = {};
			let inventory_inputs = inventory ? inventoryInputsFromRecord(inventory) : null;
			const access_script = inventory?.access_script || '';

			if (!reject_reason && !inventory) {
				reject_reason = 'active inventory not found';
			}

			if (!reject_reason && !access_script) {
				reject_reason = 'inventory access_script missing';
			}

			if (!reject_reason && !inventory_inputs) {
				inventory_tx = await this.returnTransaction(inventory.signature);
				if (!inventory_tx) {
					reject_reason = 'inventory slips missing and transaction not found';
				} else {
					inventory_txmsg = inventory_tx.returnMessage?.() || {};
					inventory = enrichInventoryFromTransaction(inventory, inventory_txmsg);
					inventory_inputs = inventoryInputsFromRecord(inventory);
					const script_address =
						inventory?.p2sh_address || inventory_txmsg?.listing?.pay_descriptor || '';
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
				reject_reason = 'store cannot spend inventory script';
			}

			if (reject_reason) {
				console.log('Store: processPendingOrders deferred', {
					sale: sale.signature,
					listing_id,
					reason: reject_reason
				});
				await this.incrementSaleRetry(sale, now);
				continue;
			}

			let fulfillment_tx = null;

			try {
				fulfillment_tx = this.mod.createFulfillmentTransaction({
					inventory,
					inventory_tx,
					inventory_txmsg,
					listing,
					sale,
					buyer,
					quantity
				});
			} catch (err) {
				console.warn('Store: processPendingOrders fulfillment build failed', err?.message);
				await this.incrementSaleRetry(sale, now);
				continue;
			}

			const nft_source_tx =
				inventory_tx || (await this.returnTransaction(inventory.signature));
			if (nft_source_tx && listing_id) {
				const nft = new SaitoNFT(this.app, this.mod, nft_source_tx, null);
				const nft_image = nft.returnImage?.() || '';
				if (nft_image) {
					this.mod.image_cache[listing_id] = nft_image;
				}
			}

			await fulfillment_tx.sign();

			await this.markOrderFulfilling(sale.id, fulfillment_tx.signature, now);

			await this.insertTransaction(fulfillment_tx, { onchain: 1 });

			console.log('Store: processPendingOrders propagating fulfillment', fulfillment_tx.signature);
			this.app.network.propagateTransaction(fulfillment_tx);
			break;
		}
	}

	async incrementSaleRetry(sale, now = Date.now()) {
		const retry_count = await this.retryOrder(sale.id, now);
		if (retry_count >= SALE_MAX_RETRIES) {
			const listing_id = sale.listing_id;
			const quantity = Number(sale.quantity) || 1;
			await this.failOrder(sale.id, listing_id, quantity, now);
		}
	}

	// --- listings ---

	async loadActiveListings(limit = 20) {
		this.listings = {};

		const rows = await this.db.loadActiveListings(limit, LISTING_STATUS_ACTIVE);
		for (const row of rows || []) {
			await this.addListing(row, { persist: false, sync_cache: true });
		}

		return Object.values(this.listings);
	}

	async addListing(data, { persist = true, sync_cache = true } = {}) {
		const listing = data instanceof Listing ? data : new Listing(this.app, this.mod, data);
		if (!listing.id) {
			return null;
		}

		this.listings[listing.id] = listing;
		if (sync_cache) {
			syncListingCache(this.mod, listing);
		}

		if (persist) {
			await this.db.insertListing(listing);
		}

		return listing;
	}

	removeListing(listing_id, { sync_cache = true } = {}) {
		delete this.listings[listing_id];
		if (sync_cache) {
			removeListingFromCache(this.mod, listing_id);
		}
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

			return await this.addListing(row, { persist: false, sync_cache: true });
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

	async reserveListing(listing_id, quantity) {
		const qty = Number(quantity) || 1;
		const listing = await this.returnListing(listing_id);
		if (!listing || Number(listing.quantity_available) < qty) {
			return false;
		}

		const now = Date.now();
		const updated = await this.db.reserveListing(listing_id, qty, now);
		if (!updated) {
			return false;
		}

		const quantity_available = Number(updated.quantity_available);
		const quantity_reserved = Number(updated.quantity_reserved);
		if (quantity_available !== Number(listing.quantity_available) - qty) {
			return false;
		}

		listing.quantity_available = quantity_available;
		listing.quantity_reserved = quantity_reserved;
		listing.updated_at = now;
		syncListingCache(this.mod, listing);

		return true;
	}

	async releaseReservation(listing_id, quantity) {
		const qty = Number(quantity) || 1;
		const now = Date.now();
		await this.db.releaseReservation(listing_id, qty, now);

		const listing = this.listings[listing_id] || (await this.returnListing(listing_id));
		if (listing) {
			listing.quantity_reserved = Math.max(0, Number(listing.quantity_reserved) - qty);
			listing.updated_at = now;
			syncListingCache(this.mod, listing);
		}
	}

	async restoreReservation(listing_id, quantity) {
		const qty = Number(quantity) || 1;
		const now = Date.now();
		await this.db.restoreReservation(listing_id, qty, now);

		const listing = this.listings[listing_id] || (await this.returnListing(listing_id));
		if (listing) {
			listing.quantity_available += qty;
			listing.quantity_reserved = Math.max(0, Number(listing.quantity_reserved) - qty);
			listing.updated_at = now;
			syncListingCache(this.mod, listing);
		}
	}

	// --- inventory ---

	async addInventory(data, { persist = true } = {}) {
		const inventory = data instanceof Inventory ? data : new Inventory(data);
		if (!inventory.signature) {
			return null;
		}

		this.inventory[inventory.signature] = inventory;

		if (persist) {
			await this.db.insertInventory(inventory);
		}

		return inventory;
	}

	removeInventory(signature) {
		delete this.inventory[signature];
	}

	async updateInventory(signature, status) {
		const now = Date.now();
		await this.db.updateInventory(signature, status, now);

		if (this.inventory[signature]) {
			this.inventory[signature].status = status;
			this.inventory[signature].updated_at = now;
		}
	}

	async returnInventory(signature) {
		if (this.inventory[signature]) {
			return this.inventory[signature];
		}

		try {
			const row = await this.db.returnInventory(signature);
			if (!row) {
				return null;
			}

			return await this.addInventory(row, { persist: false });
		} catch (err) {
			return null;
		}
	}

	async returnActiveInventory(listing_id) {
		if (!listing_id) {
			return null;
		}

		try {
			const row = await this.db.returnActiveInventory(listing_id, INVENTORY_STATUS_ACTIVE);
			if (!row) {
				return null;
			}

			return await this.addInventory(row, { persist: false });
		} catch (err) {
			return null;
		}
	}

	// --- sales / orders ---

	async addOrder(sale) {
		const params = sale instanceof Sale ? sale.toInsertParams() : sale;
		await this.db.insertOrder(params);
	}

	async returnPendingOrders() {
		const rows = await this.db.returnPendingOrders(SALE_STATUS_PENDING);
		return (rows || []).map((row) => new Sale(row));
	}

	async returnOrder(signature) {
		const row = await this.db.returnOrder(signature);
		return row ? new Sale(row) : null;
	}

	async markOrderFulfilling(order_id, fulfillment_tx, now = Date.now()) {
		await this.db.updateOrderFulfilling(order_id, fulfillment_tx, now, SALE_STATUS_FULFILLING);
	}

	async finalizeOrder(order_id, fulfillment_tx, listing_id, quantity, now = Date.now()) {
		await this.db.updateOrderFinalized(order_id, fulfillment_tx, now, SALE_STATUS_FINALIZED);
		await this.releaseReservation(listing_id, quantity);
	}

	async retryOrder(order_id, now = Date.now()) {
		const retry_count = (await this.db.returnOrderRetryCount(order_id)) + 1;
		await this.db.updateOrderRetry(order_id, retry_count, now);
		return retry_count;
	}

	async failOrder(order_id, listing_id, quantity, now = Date.now()) {
		await this.restoreReservation(listing_id, quantity);
		await this.db.updateOrderFailed(order_id, now, SALE_STATUS_FAILED);
	}

	// --- transaction archive ---

	async insertTransaction(tx, chain = {}) {
		await this.db.insertTransaction(tx, this.app, chain);
	}

	async returnTransaction(signature) {
		return this.db.returnTransaction(signature, this.app);
	}

	async onChainReorganization(block_id, block_hash, onchain) {
		const params = await this.db.applyChainReorganization(block_id, block_hash, onchain);

		for (const inventory of Object.values(this.inventory)) {
			if (
				Number(inventory.block_id) === params.$block_id &&
				String(inventory.block_hash || '') === params.$block_hash
			) {
				inventory.onchain = params.$onchain;
			}
		}
	}
}

module.exports = Warehouse;
module.exports.INVENTORY_STATUS_ACTIVE = INVENTORY_STATUS_ACTIVE;
module.exports.INVENTORY_STATUS_SPENT = INVENTORY_STATUS_SPENT;
module.exports.SALE_STATUS_PENDING = SALE_STATUS_PENDING;
module.exports.SALE_STATUS_FULFILLING = SALE_STATUS_FULFILLING;
module.exports.SALE_STATUS_FINALIZED = SALE_STATUS_FINALIZED;
module.exports.SALE_STATUS_FAILED = SALE_STATUS_FAILED;
module.exports.SALE_MAX_RETRIES = SALE_MAX_RETRIES;
