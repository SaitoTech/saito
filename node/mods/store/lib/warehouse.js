const Summary = require('./summary');
const Listing = require('./listing');
const Database = require('./database');
const { syncSummaryCache, summaryBucketKey } = require('./ui/summary-cache');
const Order = require('./order');
const Slip = require('../../../lib/saito/slip').default;
const { ORDER_STATUS_PENDING, ORDER_STATUS_SETTLING, ORDER_STATUS_FULFILLED, ORDER_STATUS_UNFULFILLABLE } = require('./order');
const {
	findInventoryTriple,
	serializeSlip,
	normalizeSlipJson,
	listingInputSlipJsonFromRecord,
	transactionIndexInBlock,
	returnListingSlipId,
	slipPublicKey
} = require('./helpers');
const { loadTransactionFromArchive } = require('./archive');
const { initializeImageCache } = require('./images');
const { executeListingScript, returnCreatedNftTuples, returnSpentNftTuples } = require('./scripting');
const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');

class Warehouse {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.db = new Database(app, mod);
		this.listings = {};
		this.summaries = {};
	}

	async initialize() {
		if (this.app.BROWSER) {
			return;
		}

		await this.db.ensureSchema();
		this.mod.summaries = {};
		await this.initializeSummaryCache();
		await initializeImageCache(this.mod);
	}

	async initializeSummaryCache() {
		const buckets = await this.db.scanListingsForSummaryRebuild();
		for (const bucket of buckets || []) {
			await this.syncSummaryForBucket(bucket.nft_id, bucket.price);
		}

		const rows = await this.db.loadAllSummaries();
		for (const row of rows || []) {
			const key = summaryBucketKey(row.nft_id, row.price);
			if (!this.summaries[key]) {
				await this.syncSummaryToCache(row.nft_id, row.price);
			}
		}

		this.mod.summaries = this.summaries;
	}

	async onNewBlock(blk, lc) {
		if (!lc) {
			return;
		}
		await this.processQueue();
	}

	async onChainReorganization(block_id, block_hash, longest_chain) {
		await this.db.updateListingsListedChainState(block_id, block_hash, longest_chain);
		await this.db.updateListingsSoldChainState(block_id, block_hash, longest_chain);
		await this.db.updateOrdersReceivedChainState(block_id, block_hash, longest_chain);
		await this.db.updateOrdersFulfilledChainState(block_id, block_hash, longest_chain);

		for (const row of Object.values(this.listings)) {
			const listed =
				Number(row.block_id_listed ?? row.block_id) === Number(block_id) &&
				String((row.block_hash_listed ?? row.block_hash) || '') === String(block_hash || '');
			const sold =
				Number(row.block_id_sold) === Number(block_id) &&
				String(row.block_hash_sold || '') === String(block_hash || '');

			if (listed) {
				row.longest_chain_listed = longest_chain ? 1 : 0;
			}
			if (sold) {
				row.longest_chain_sold = longest_chain ? 1 : 0;
			}
		}

		await this.rebuildSummaries();
	}

	// --- listings ---

	async addListing(nftOrRow, tx = null, txmsg = null, blk = null) {
		if (this.app.BROWSER) {
			return null;
		}

		if (tx && txmsg) {
			return this.addListingFromTransaction(nftOrRow, tx, txmsg, blk);
		}

		const row = nftOrRow;
		if (!row?.signature || (await this.listingExists(row.signature))) {
			return null;
		}

		const listing = new Listing(row);
		this.listings[listing.signature] = listing;

		try {
			await this.db.insertListingRow(listing);
		} catch (err) {
			if (String(err?.message || err).includes('UNIQUE')) {
				return null;
			}
			throw err;
		}

		const summary = await this.ensureSummaryForListing(listing);
		await this.syncSummaryForBucket(summary.nft_id, summary.price);

		return listing;
	}

	async removeListing(nftOrRows, tx = null, txmsg = null, blk = null) {
		if (this.app.BROWSER) {
			return [];
		}

		let spent_rows = [];

		if (tx) {
			spent_rows = await this.matchSpentListings(tx);
		} else if (Array.isArray(nftOrRows)) {
			spent_rows = nftOrRows;
		} else if (nftOrRows?.signature) {
			spent_rows = [nftOrRows];
		}

		if (!spent_rows.length) {
			return [];
		}

		const now = Date.now();
		const removed = [];

		for (const row of spent_rows) {
			const listing_row = new Listing(row);
			if (listing_row.isSoldOnChain()) {
				continue;
			}

			const sold_block_id = Number(blk?.id ?? 0);
			const sold_block_hash = String(blk?.hash ?? '');
			const sold_transaction_id = transactionIndexInBlock(blk, tx);
			await this.db.markListingSold(row.signature, {
				sold_block_id,
				sold_block_hash,
				sold_transaction_id
			}, now);
			delete this.listings[row.signature];

			await this.syncSummaryForBucket(row.nft_id, row.price);

			removed.push(row);
		}

		return removed;
	}

	// --- orders ---

	async addOrder(order) {
		const params = order instanceof Order ? order.toInsertParams() : order;
		await this.db.insertOrder(params);
		return params;
	}

	async confirmSettlement(blk, tx) {
		if (this.app.BROWSER || !tx?.signature) {
			return;
		}

		const txmsg = tx.returnMessage?.() || {};
		const fulfill = txmsg.fulfill_sale;
		if (!fulfill?.sale_signature) {
			return;
		}

		const order_row =
			(await this.db.returnOrderBySettlementSig(tx.signature)) ||
			(await this.db.returnOrderByTxSig(fulfill.sale_signature));
		if (!order_row) {
			return;
		}

		const order = new Order(order_row);
		const fulfilled_block_id = Number(blk?.id ?? 0);
		const fulfilled_block_hash = String(blk?.hash ?? '');
		const fulfilled_transaction_id = transactionIndexInBlock(blk, tx);
		const now = Date.now();

		if (order.isFulfilled()) {
			return;
		}

		await this.db.updateOrder(order.id, {
			status: ORDER_STATUS_FULFILLED,
			block_id_fulfilled: fulfilled_block_id,
			block_hash_fulfilled: fulfilled_block_hash,
			transaction_id_fulfilled: fulfilled_transaction_id,
			longest_chain_fulfilled: 1
		});

		const prior_listing = fulfill.prior_inventory || '';
		const consumed_signatures = Array.isArray(fulfill.listing_signatures)
			? fulfill.listing_signatures.filter(Boolean)
			: prior_listing
				? [prior_listing]
				: [];

		for (const signature of consumed_signatures) {
			await this.db.markListingSold(signature, {
				sold_block_id: fulfilled_block_id,
				sold_block_hash: fulfilled_block_hash,
				sold_transaction_id: fulfilled_transaction_id
			}, now);
			delete this.listings[signature];
		}

		await this.syncSummaryForBucket(order.nft_id, order.price);
	}

	async processQueue() {
		if (this.app.BROWSER) {
			return;
		}

		await this.resetStaleSettlementPendingListings();
		await this.resetOrphanedSettlements();
		await this.resetOrphanedFulfillments();

		const orders = await this.db.returnPendingOrders();
		if (!orders?.length) {
			return;
		}

		const retry_limit = Number(this.mod.order_retry_limit ?? 10);

		for (const order_row of orders) {
			const order = new Order(order_row);

			if (!order.isProcessable()) {
				if (order.isAwaitingSettlementConfirmation()) {
					continue;
				}
				continue;
			}

			const listing_rows = await this.getListingsForFulfillment(order_row);
			if (!listing_rows.length) {
				await this.deferOrder(order, retry_limit);
				continue;
			}

			if (await this.fulfillOrder(order_row, listing_rows)) {
				break;
			}
		}
	}

	async resetOrphanedSettlements() {
		const rows = await this.db.returnOrphanedSettlingOrders();
		const now = Date.now();

		for (const row of rows || []) {
			const order = new Order(row);
			await this.clearSettlementPendingForOrder(order);
			await this.db.updateOrder(order.id, {
				settlement_tx_sig: '',
				status: ORDER_STATUS_PENDING,
				block_id_fulfilled: 0,
				block_hash_fulfilled: '',
				transaction_id_fulfilled: 0,
				longest_chain_fulfilled: 0
			});
			await this.syncSummaryForBucket(order.nft_id, order.price);
		}
	}

	async resetStaleSettlementPendingListings() {
		const pending_rows = await this.db.returnListingsWithSettlementPending();
		if (!pending_rows?.length) {
			return;
		}

		const settling_orders = await this.db.returnSettlingOrders();
		const reserved = new Set();

		for (const order_row of settling_orders || []) {
			const signatures = await this.returnSettlementListingSignatures(order_row);
			for (const signature of signatures) {
				reserved.add(signature);
			}
		}

		const now = Date.now();
		for (const row of pending_rows) {
			if (reserved.has(row.signature)) {
				continue;
			}
			await this.db.clearListingSettlementPending(row.signature, now);
			await this.syncSummaryForBucket(row.nft_id, row.price);
		}
	}

	async returnSettlementListingSignatures(order_row) {
		if (!order_row?.settlement_tx_sig) {
			return [];
		}

		const settlement_tx = await loadTransactionFromArchive(
			this.app,
			order_row.settlement_tx_sig
		);
		const txmsg = settlement_tx?.returnMessage?.() || {};
		const fulfill = txmsg.fulfill_sale || {};
		const signatures = Array.isArray(fulfill.listing_signatures)
			? fulfill.listing_signatures.filter(Boolean)
			: [];
		if (!signatures.length && fulfill.prior_inventory) {
			signatures.push(fulfill.prior_inventory);
		}
		return signatures;
	}

	async clearSettlementPendingForOrder(order) {
		const signatures = await this.returnSettlementListingSignatures(order);
		const now = Date.now();
		for (const signature of signatures) {
			await this.db.clearListingSettlementPending(signature, now);
			if (this.listings[signature]) {
				this.listings[signature].block_id_sold = 0;
			}
		}
	}

	async resetOrphanedFulfillments() {
		const rows = await this.db.returnOrphanedFulfilledOrders();

		for (const row of rows || []) {
			const order = new Order(row);
			await this.db.updateOrder(order.id, {
				settlement_tx_sig: '',
				status: ORDER_STATUS_PENDING,
				block_id_fulfilled: 0,
				block_hash_fulfilled: '',
				transaction_id_fulfilled: 0,
				longest_chain_fulfilled: 0
			});
		}
	}

	async deferOrder(order, retry_limit) {
		const attempts = await this.db.incrementOrderAttempts(order.id);
		if (attempts >= retry_limit) {
			await this.failOrder(order);
		}
	}

	async failOrder(order) {
		await this.db.updateOrder(order.id, { status: ORDER_STATUS_UNFULFILLABLE });

		try {
			await this.mod.propagateOrderRefund(order, {
				refund_public_key: order.buyer,
				reason: 'unable-to-fulfill'
			});
		} catch (err) {
			console.warn('Store: order refund failed', err?.message);
		}
	}

	/**
	 * Single fulfillment planner: validates the order and selects listing rows, or returns [].
	 */
	async getListingsForFulfillment(order_row) {
		const order = new Order(order_row);
		const quantity = Number(order.quantity) || 1;
		const max_price = Number(order.price ?? 0);
		const summary_row = await this.db.returnSummaryByBucket(order.nft_id, max_price);
		if (!summary_row) {
			return [];
		}

		if (Number(summary_row.quantity_available ?? 0) < quantity) {
			return [];
		}

		if (BigInt(order.price ?? 0) < BigInt(summary_row.price ?? 0)) {
			return [];
		}

		const required_payment = BigInt(order.price ?? 0) * BigInt(quantity);
		if (BigInt(order.payment_amount ?? 0) < required_payment) {
			return [];
		}

		const bucket_price = await this.db.returnLowestSatisfyingPriceForNft(
			order.nft_id,
			max_price,
			quantity
		);
		if (bucket_price === null) {
			return [];
		}

		const candidates = await this.db.returnSpendableListingsForBucket(
			order.nft_id,
			bucket_price,
			quantity
		);
		if (!candidates?.length) {
			return [];
		}

		let remaining = quantity;
		const listing_rows = [];

		for (const listing_row of candidates) {
			if (remaining <= 0) {
				break;
			}

			if (!listing_row.access_script || !listingInputSlipJsonFromRecord(listing_row)) {
				return [];
			}

			if (
				!(await executeListingScript(
					this.app,
					listing_row.access_script,
					this.mod.store_public_key
				))
			) {
				return [];
			}

			const row_qty = Number(listing_row.quantity) || 1;
			const take_qty = Math.min(row_qty, remaining);
			listing_rows.push({ ...listing_row, take_qty });
			remaining -= take_qty;
		}

		if (remaining > 0) {
			return [];
		}

		return listing_rows;
	}

	async fulfillOrder(order_row, listing_rows) {
		const order = new Order(order_row);

		let fulfillment_tx = null;
		let listing_tx = null;
		try {
			const primary_signature = listing_rows[0]?.signature;
			listing_tx = primary_signature
				? await loadTransactionFromArchive(this.app, primary_signature)
				: null;
			if (!listing_tx) {
				throw new Error('listing transaction not available from archive');
			}

			fulfillment_tx = await this.mod.createFulfillmentTransaction(
				order,
				listing_rows,
				listing_tx
			);
		} catch (err) {
			console.warn('Store: fulfillOrder settlement build failed', err?.message);
			return false;
		}

		const now = Date.now();
		for (const listing_row of listing_rows) {
			await this.db.markListingSettlementPending(listing_row.signature, now);
			if (this.listings[listing_row.signature]) {
				this.listings[listing_row.signature].block_id_sold = -1;
			}
		}
		await this.syncSummaryForBucket(order.nft_id, order.price);

		const primary_signature = listing_rows[0]?.signature;
		if (primary_signature && order.nft_id && !this.mod.image_cache[order.nft_id] && listing_tx) {
			const nft = new SaitoNFT(this.app, this.mod, listing_tx, null);
			const nft_image = nft.returnImage?.() || '';
			if (nft_image) {
				this.mod.image_cache[order.nft_id] = nft_image;
			}
		}

		await this.db.updateOrder(order.id, {
			settlement_tx_sig: fulfillment_tx.signature,
			status: ORDER_STATUS_SETTLING
		});

		console.log('Store: fulfillOrder propagating settlement', fulfillment_tx.signature);
		this.app.network.propagateTransaction(fulfillment_tx);
		return true;
	}

	// --- summaries ---

	/**
	 * Full summary rebuild — only for chain reorganization / rollback recovery.
	 */
	async rebuildSummaries() {
		const buckets = await this.db.scanListingsForSummaryRebuild();
		const existing = await this.db.loadAllSummaries();
		const existing_by_bucket = {};

		for (const row of existing || []) {
			existing_by_bucket[summaryBucketKey(row.nft_id, row.price)] = row;
		}

		await this.db.clearSummaries();
		this.summaries = {};

		const now = Date.now();

		for (const bucket of buckets || []) {
			const nft_id = bucket.nft_id;
			const price = Number(bucket.price ?? 0);
			const prev = existing_by_bucket[summaryBucketKey(nft_id, price)] || {};

			await this.db.insertSummary({
				nft_id,
				price,
				title: prev.title || '',
				description: prev.description || '',
				image: null,
				quantity_available: Number(bucket.total_quantity ?? 0),
				updated_at: now
			});

			const row = await this.db.returnSummaryByBucket(nft_id, price);
			if (row) {
				const summary = new Summary(this.app, this.mod, row);
				const listing = await this.db.returnActiveListingForBucket(nft_id, price);
				if (listing?.signature) {
					summary.listing_signature = listing.signature;
				}
				const key = summaryBucketKey(nft_id, price);
				this.summaries[key] = summary;
				syncSummaryCache(this.mod, summary);
			}
		}

		this.mod.summaries = this.summaries;
	}

	returnActiveSummaries() {
		return Object.values(this.summaries).filter((summary) => summary.isActive());
	}

	async returnSummaryByBucket(nft_id, price) {
		const key = summaryBucketKey(nft_id, price);
		if (this.summaries[key]) {
			return this.summaries[key];
		}

		try {
			const row = await this.db.returnSummaryByBucket(nft_id, price);
			if (!row) {
				return null;
			}

			const summary = new Summary(this.app, this.mod, row);
			this.summaries[key] = summary;
			syncSummaryCache(this.mod, summary);
			return summary;
		} catch (err) {
			return null;
		}
	}

	// --- internal ---

	async addListingFromTransaction(nft, tx, txmsg, blk = null) {
		const signature = tx?.signature || '';

		if (!tx?.signature) {
			console.warn('Store: addListingFromTransaction: malformed transaction (missing signature)');
			return null;
		}

		if (await this.listingExists(tx.signature)) {
			console.warn('Store: addListingFromTransaction: duplicate listing', signature);
			return null;
		}

		const access_script = txmsg.access_script || '';
		if (!(await executeListingScript(this.app, access_script, this.mod.store_public_key))) {
			console.warn('Store: addListingFromTransaction: executeListingScript failed', signature);
			return null;
		}

		const observation = this.observeListingFromTransaction(nft, tx, txmsg, blk);
		if (!observation) {
			return null;
		}

		const listing = await this.addListing(observation);
		if (!listing) {
			return null;
		}

		this.app.storage
			.saveTransaction(tx, { field1: 'Store', preserve: 1 }, 'localhost', blk)
			.catch((err) => {
				console.warn(
					'Store: failed to save listing transaction to Archive',
					tx.signature,
					err?.message || err
				);
			});

		await this.persistSummaryMetadata(listing.nft_id, listing.price, txmsg);
		await this.syncSummaryToCache(listing.nft_id, listing.price);

		const image = nft.returnImage?.() || '';
		if (image && listing.nft_id) {
			this.mod.image_cache[listing.nft_id] = image;
		}

		return listing;
	}

	extractListingMetadata(txmsg = {}) {
		const listing = txmsg.listing || {};
		return {
			title: String(listing.title || txmsg.title || '').trim(),
			description: String(listing.description ?? txmsg.description ?? '').trim()
		};
	}

	async persistSummaryMetadata(nft_id, price, txmsg = {}) {
		const { title, description } = this.extractListingMetadata(txmsg);
		if (!title && !description) {
			return;
		}
		await this.db.updateSummaryMetadata(nft_id, price, { title, description });
	}

	async syncSummaryToCache(nft_id, price) {
		const row = await this.db.returnSummaryByBucket(nft_id, price);
		if (!row) {
			return null;
		}

		const summary = new Summary(this.app, this.mod, row);
		const listing = await this.db.returnActiveListingForBucket(nft_id, price);
		if (listing?.signature) {
			summary.listing_signature = listing.signature;
		}
		const key = summaryBucketKey(nft_id, price);
		this.summaries[key] = summary;
		this.mod.summaries = this.summaries;
		syncSummaryCache(this.mod, summary);
		return summary;
	}

	async ensureSummaryForListing(listing) {
		const existing = await this.db.returnSummaryByBucket(listing.nft_id, listing.price);
		if (existing) {
			return existing;
		}

		const now = Date.now();
		await this.db.insertSummary({
			nft_id: listing.nft_id,
			price: listing.price,
			title: '',
			description: '',
			image: null,
			quantity_available: 0,
			updated_at: now
		});

		return this.db.returnSummaryByBucket(listing.nft_id, listing.price);
	}

	observeListingFromTransaction(nft, tx, txmsg, blk = null) {
		const signature = tx?.signature || '';
		const created_tuples = returnCreatedNftTuples(tx);

		if (!created_tuples.length) {
			console.warn('Store: observeListingFromTransaction: no NFT tuple created', signature);
			return null;
		}

		const script_address = txmsg.p2sh_address || '';
		if (!script_address) {
			console.warn(
				'Store: observeListingFromTransaction: malformed transaction (missing p2sh_address)',
				signature
			);
			return null;
		}

		const slip_key = slipPublicKey(this.app, script_address);
		const listed_block_id = Number(blk?.id ?? 0);
		const listed_block_hash = String(blk?.hash ?? '');
		const listed_transaction_id = transactionIndexInBlock(blk, tx);
		const inventory_triple = findInventoryTriple(tx.to, slip_key);

		if (!inventory_triple) {
			console.warn('Store: observeListingFromTransaction: inventory triple missing', signature, {
				slip_key
			});
			return null;
		}

		const meta = txmsg.listing || {};
		const fulfill = txmsg.fulfill_sale || {};
		const price_nolan = Number(this.app.wallet.convertSaitoToNolan(meta.price ?? 0) ?? 0);
		const change_qty = inventory_triple[0]?.amount;

		return {
			signature: tx.signature,
			nft_id: String(nft.id || nft.uuid || meta.nft_id || ''),
			seller: fulfill.seller || tx.from?.[0]?.publicKey || '',
			quantity: Number(change_qty ?? nft.amount ?? inventory_triple[0]?.amount ?? 1) || 1,
			price: price_nolan,
			access_hash: txmsg.access_hash || '',
			access_script: txmsg.access_script || '',
			p2sh_address: script_address,
			block_id_listed: listed_block_id,
			block_hash_listed: listed_block_hash,
			transaction_id_listed: listed_transaction_id,
			longest_chain_listed: 1,
			block_id_sold: 0,
			block_hash_sold: '',
			transaction_id_sold: 0,
			longest_chain_sold: 0,
			slip_id: returnListingSlipId(tx, slip_key),
			on_chain: 1,
			utxo_slip1: serializeSlip(inventory_triple[0]),
			utxo_slip2: serializeSlip(inventory_triple[1]),
			utxo_slip3: serializeSlip(inventory_triple[2]),
			created_at: Date.now(),
			updated_at: Date.now()
		};
	}

	async matchSpentListings(tx) {
		const spent_tuples = returnSpentNftTuples(tx);
		if (!spent_tuples.length) {
			return [];
		}

		const rows = await this.db.returnAllActiveListingRows();
		const spent = [];

		for (const row of rows || []) {
			const listing_row = new Listing(row);
			if (listing_row.isSoldOnChain()) {
				continue;
			}

			const slip_json = listingInputSlipJsonFromRecord(row);
			if (!slip_json) {
				continue;
			}

			const anchored = slip_json.map((data) => new Slip(undefined, normalizeSlipJson(data)));
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

	async returnAvailableQuantity(nft_id, price) {
		return this.db.sumListingQuantityForBucket(nft_id, price);
	}

	async syncSummaryForBucket(nft_id, price) {
		const available = await this.db.sumListingQuantityForBucket(nft_id, price);
		let row = await this.db.returnSummaryByBucket(nft_id, price);

		if (!row && available <= 0) {
			return null;
		}

		const now = Date.now();

		if (!row) {
			await this.db.insertSummary({
				nft_id,
				price: Number(price ?? 0),
				title: '',
				description: '',
				image: null,
				quantity_available: available,
				updated_at: now
			});
			row = await this.db.returnSummaryByBucket(nft_id, price);
		} else {
			await this.db.updateSummaryAvailableByBucket(nft_id, price, available, now);
			if (available <= 0) {
				const refreshed = await this.db.returnSummaryByBucket(nft_id, price);
				const has_metadata = !!(refreshed?.title || refreshed?.description);
				if (!has_metadata) {
					await this.db.deleteSummaryByBucket(nft_id, price);
					const key = summaryBucketKey(nft_id, price);
					delete this.summaries[key];
					this.mod.summaries = this.summaries;
					return null;
				}
			}
		}

		return this.syncSummaryToCache(nft_id, price);
	}

	async listingExists(signature) {
		if (!signature) {
			return false;
		}
		if (this.listings[signature]) {
			return true;
		}
		return !!(await this.db.returnListingBySignature(signature));
	}
}

module.exports = Warehouse;
