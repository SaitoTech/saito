const Summary = require('./summary');
const Listing = require('./listing');
const Database = require('./database');
const { syncSummaryCache } = require('./ui/summary-cache');
const Order = require('./order');
const { ORDER_STATUS_PENDING, ORDER_STATUS_SETTLING, ORDER_STATUS_FULFILLED, ORDER_STATUS_UNFULFILLABLE } = require('./order');
const {
	findInventoryTriple,
	anchorInventoryInputs,
	listingInputsFromRecord,
	serializeAnchoredListingSlips,
	serializePaymentSlip,
	returnChainLocation,
	returnListingSlipId,
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
		this.summaries = {};
	}

	async initialize() {
		if (this.app.BROWSER) {
			return;
		}

		await this.db.ensureSchema();
		this.mod.summaries = {};
		await this.rebuildSummaries();
		await initializeImageCache(this.mod);
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
		await this.db.updateTransactionsChainState(block_id, block_hash, longest_chain);

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
		await this.updateSummary(summary.id, {
			quantity_available: Number(summary.quantity_available) + Number(listing.quantity || 1)
		});

		await this.syncSummaryToCache(summary.nft_id, summary.price);
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

			const chain = tx ? returnChainLocation(blk, tx) : {};
			await this.db.markListingSold(row.signature, chain, now);
			delete this.listings[row.signature];

			const summary = await this.db.returnSummaryByBucket(row.nft_id, row.price);
			if (summary?.id) {
				const qty = Number(row.quantity) || 1;
				const available = Math.max(0, Number(summary.quantity_available) - qty);
				const sold = Number(summary.quantity_sold) || 0;

				await this.updateSummary(summary.id, {
					quantity_available: available,
					quantity_sold: sold + qty
				});

				const refreshed = await this.db.returnSummary(summary.id);
				if (
					refreshed &&
					Number(refreshed.quantity_available) <= 0 &&
					Number(refreshed.quantity_pending) <= 0 &&
					Number(refreshed.quantity_sold) <= 0
				) {
					await this.deleteSummary(summary.id);
				} else {
					await this.syncSummaryToCache(row.nft_id, row.price);
				}
			}

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
		const chain = returnChainLocation(blk, tx);
		const now = Date.now();

		if (order.isFulfilled()) {
			return;
		}

		await this.db.updateOrder(order.id, {
			status: ORDER_STATUS_FULFILLED,
			block_id_fulfilled: chain.block_id,
			block_hash_fulfilled: chain.block_hash,
			transaction_id_fulfilled: chain.transaction_id,
			longest_chain_fulfilled: 1
		});

		const prior_listing = fulfill.prior_inventory || '';
		if (prior_listing) {
			await this.db.markListingSold(prior_listing, chain, now);
			delete this.listings[prior_listing];
		}

		const summary = await this.db.returnSummaryByBucket(order.nft_id, order.price);
		if (summary?.id) {
			const qty = Number(fulfill.quantity ?? order.quantity ?? 1);
			await this.updateSummary(summary.id, {
				quantity_pending: Math.max(0, Number(summary.quantity_pending) - qty),
				quantity_sold: Number(summary.quantity_sold) + qty
			});
			await this.syncSummaryToCache(order.nft_id, order.price);
		}
	}

	async processQueue() {
		if (this.app.BROWSER) {
			return;
		}

		await this.resetOrphanedSettlements();
		await this.resetOrphanedFulfillments();

		const orders = await this.db.returnPendingOrders();
		if (!orders?.length) {
			return;
		}

		const retry_limit = Number(this.mod.order_retry_limit ?? 10);

		for (const row of orders) {
			const order = new Order(row);

			if (!order.isProcessable()) {
				if (order.isAwaitingSettlementConfirmation()) {
					continue;
				}

				if (order.isPending() && order.isReceivedOnChain() && !order.isFulfilledOnChain()) {
					const listing_rows = await this.findSpendableListings(
						order.nft_id,
						order.price,
						order.quantity
					);
					if (!listing_rows.length) {
						await this.deferOrder(order, retry_limit);
					}
				}
				continue;
			}

			const listing_rows = await this.findSpendableListings(
				order.nft_id,
				order.price,
				order.quantity
			);

			if (!listing_rows.length) {
				await this.deferOrder(order, retry_limit);
				continue;
			}

			const success = await this.fulfillOrder(order, listing_rows);
			if (success) {
				break;
			}
		}
	}

	async resetOrphanedSettlements() {
		const rows = await this.db.returnOrphanedSettlingOrders();
		const now = Date.now();

		for (const row of rows || []) {
			const order = new Order(row);
			await this.db.releaseListingsForOrder(order.id, now);
			await this.db.updateOrder(order.id, {
				settlement_tx_sig: '',
				status: ORDER_STATUS_PENDING,
				block_id_fulfilled: 0,
				block_hash_fulfilled: '',
				transaction_id_fulfilled: 0,
				longest_chain_fulfilled: 0
			});

			for (const listing_row of Object.values(this.listings)) {
				if (Number(listing_row.reserved_order_id) === Number(order.id)) {
					listing_row.in_flight = 0;
					listing_row.reserved_order_id = 0;
				}
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
			const payment_tx = await this.db.returnTransaction(order.payment_tx_sig, this.app);
			const purchase_tx =
				payment_tx || (await this.db.returnTransaction(order.order_tx_sig, this.app));
			const purchase_txmsg = purchase_tx?.returnMessage?.() || {};

			await this.mod.propagateOrderRefund(order, {
				payment_tx: purchase_tx,
				refund_public_key: purchase_txmsg.refund || order.buyer,
				reason: 'unable-to-fulfill'
			});
		} catch (err) {
			console.warn('Store: order refund failed', err?.message);
		}
	}

	async fulfillOrder(order, listing_rows) {
		const quantity = Number(order.quantity) || 1;
		const summary_row = await this.db.returnSummaryByBucket(order.nft_id, order.price);
		const summary = summary_row ? new Summary(this.app, this.mod, summary_row) : null;
		const reject_reason = this.canFulfillOrder(order, summary, quantity);

		if (reject_reason) {
			console.log('Store: fulfillOrder rejected', {
				order: order.order_tx_sig,
				reason: reject_reason
			});
			return false;
		}

		for (const row of listing_rows) {
			const validation = await this.validateListingRow(row);
			if (validation) {
				console.log('Store: fulfillOrder listing invalid', {
					order: order.order_tx_sig,
					listing: row.signature,
					reason: validation
				});
				return false;
			}
		}

		const now = Date.now();
		const primary = listing_rows[0];

		for (const row of listing_rows) {
			await this.db.reserveListing(row.signature, order.id, now);
			if (this.listings[row.signature]) {
				this.listings[row.signature].in_flight = 1;
				this.listings[row.signature].reserved_order_id = order.id;
			}
		}

		await this.updateSummary(summary.id, {
			quantity_available: Math.max(0, Number(summary.quantity_available) - quantity),
			quantity_pending: Number(summary.quantity_pending) + quantity
		});
		await this.syncSummaryToCache(order.nft_id, order.price);

		const listing_tx = await this.db.returnTransaction(primary.signature, this.app);
		const listing_txmsg = listing_tx?.returnMessage?.() || {};
		const payment_tx = await this.db.returnTransaction(order.payment_tx_sig, this.app);
		const listings = listing_rows.map((row) => new Listing(row));
		const listing = listings[0];
		listing.summary_id = summary.id;

		let outbound_tx = null;

		try {
			outbound_tx = this.mod.createFulfillmentTransaction({
				listing,
				listings,
				listing_tx,
				listing_txmsg,
				summary,
				sale: order,
				buyer: order.buyer,
				quantity,
				payment_tx
			});
		} catch (err) {
			console.warn('Store: fulfillOrder settlement build failed', err?.message);
			await this.releaseReservedListings(listing_rows, now);
			await this.updateSummary(summary.id, {
				quantity_available: Number(summary.quantity_available) + quantity,
				quantity_pending: Math.max(0, Number(summary.quantity_pending) - quantity)
			});
			await this.syncSummaryToCache(order.nft_id, order.price);
			return false;
		}

		if (listing_tx && summary?.id) {
			const nft = new SaitoNFT(this.app, this.mod, listing_tx, null);
			const nft_image = nft.returnImage?.() || '';
			if (nft_image) {
				this.mod.image_cache[summary.id] = nft_image;
			}
		}

		await outbound_tx.sign();
		await this.db.updateOrder(order.id, {
			settlement_tx_sig: outbound_tx.signature,
			status: ORDER_STATUS_SETTLING
		});
		await this.db.insertTransaction(outbound_tx, this.app, { onchain: 1 });

		console.log('Store: fulfillOrder propagating settlement', outbound_tx.signature);
		this.app.network.propagateTransaction(outbound_tx);
		return true;
	}

	async releaseReservedListings(listing_rows, now = Date.now()) {
		for (const row of listing_rows || []) {
			await this.db.releaseListing(row.signature, now);
			if (this.listings[row.signature]) {
				this.listings[row.signature].in_flight = 0;
				this.listings[row.signature].reserved_order_id = 0;
			}
		}
	}

	// --- summaries ---

	async rebuildSummaries() {
		const buckets = await this.db.scanListingsForSummaryRebuild();
		const existing = await this.db.loadAllSummaries();
		const existing_by_bucket = {};

		for (const row of existing || []) {
			existing_by_bucket[this.bucketKey(row.nft_id, row.price)] = row;
		}

		await this.db.clearSummaries();
		this.summaries = {};

		const now = Date.now();

		for (const bucket of buckets || []) {
			const nft_id = bucket.nft_id;
			const price = Number(bucket.price ?? 0);
			const prev = existing_by_bucket[this.bucketKey(nft_id, price)] || {};

			await this.db.insertSummary({
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

			const row = await this.db.returnSummaryByBucket(nft_id, price);
			if (row) {
				const summary = new Summary(this.app, this.mod, row);
				this.summaries[summary.id] = summary;
				syncSummaryCache(this.mod, summary);
			}
		}

		this.mod.summaries = this.summaries;
	}

	returnActiveSummaries() {
		return Object.values(this.summaries).filter((summary) => summary.isActive());
	}

	async returnSummary(summary_id) {
		if (this.summaries[summary_id]) {
			return this.summaries[summary_id];
		}

		try {
			const row = await this.db.returnSummary(summary_id);
			if (!row) {
				return null;
			}

			const summary = new Summary(this.app, this.mod, row);
			this.summaries[summary.id] = summary;
			syncSummaryCache(this.mod, summary);
			return summary;
		} catch (err) {
			return null;
		}
	}

	async returnActiveListingForSummary(summary_id) {
		const summary = await this.returnSummary(summary_id);
		if (!summary) {
			return null;
		}

		const row = await this.db.returnActiveListingForBucket(summary.nft_id, summary.price);
		return row ? new Listing(row) : null;
	}

	// --- internal ---

	async addListingFromTransaction(nft, tx, txmsg, blk = null) {
		if (!tx?.signature || (await this.listingExists(tx.signature))) {
			return null;
		}

		const access_script = txmsg.access_script || '';
		if (!(await executeListingScript(this.app, access_script, this.mod.store_public_key))) {
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

		const summary = await this.db.returnSummaryByBucket(listing.nft_id, listing.price);
		const image = nft.returnImage?.() || '';
		if (image && summary?.id) {
			this.mod.image_cache[summary.id] = image;
		}

		return listing;
	}

	async syncSummaryToCache(nft_id, price) {
		const row = await this.db.returnSummaryByBucket(nft_id, price);
		if (!row) {
			return null;
		}

		const summary = new Summary(this.app, this.mod, row);
		this.summaries[summary.id] = summary;
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
			quantity_pending: 0,
			quantity_sold: 0,
			updated_at: now
		});

		return this.db.returnSummaryByBucket(listing.nft_id, listing.price);
	}

	observeListingFromTransaction(nft, tx, txmsg, blk = null) {
		const tuples = returnP2SHTuples(tx);
		if (!tuples.outputs?.length) {
			return null;
		}

		const script_address = txmsg.p2sh_address || '';
		const slip_key = slipPublicKey(this.app, script_address);
		const chain = returnChainLocation(blk, tx);
		const utxo_slips = serializeAnchoredListingSlips(tx, slip_key, chain);

		if (!utxo_slips) {
			return null;
		}

		const meta = txmsg.listing || {};
		const fulfill = txmsg.fulfill_sale || {};
		const price_nolan = Number(this.app.wallet.convertSaitoToNolan(meta.price ?? 0) ?? 0);
		const change_triple = tuples.outputs[0]?.slips;
		const change_qty = change_triple?.[0]?.amount;

		return {
			signature: tx.signature,
			nft_id: String(nft.id || nft.uuid || meta.nft_id || ''),
			seller: fulfill.seller || tx.from?.[0]?.publicKey || '',
			quantity:
				Number(change_qty ?? nft.amount ?? tuples.outputs[0]?.slips?.[0]?.amount ?? 1) || 1,
			price: price_nolan,
			access_hash: txmsg.access_hash || '',
			access_script: txmsg.access_script || '',
			p2sh_address: script_address,
			block_id_listed: chain.block_id,
			block_hash_listed: chain.block_hash,
			transaction_id_listed: chain.transaction_id,
			longest_chain_listed: 1,
			block_id_sold: 0,
			block_hash_sold: '',
			transaction_id_sold: 0,
			longest_chain_sold: 0,
			slip_id: returnListingSlipId(tx, slip_key),
			on_chain: 1,
			in_flight: 0,
			reserved_order_id: 0,
			utxo_slip1: utxo_slips[0],
			utxo_slip2: utxo_slips[1],
			utxo_slip3: utxo_slips[2],
			created_at: Date.now(),
			updated_at: Date.now()
		};
	}

	async matchSpentListings(tx) {
		const tuples = returnP2SHTuples(tx);
		if (!tuples.inputs?.length) {
			return [];
		}

		const rows = await this.db.returnAllActiveListingRows();
		const spent = [];

		for (const row of rows || []) {
			const listing_row = new Listing(row);
			if (listing_row.isSoldOnChain()) {
				continue;
			}

			let anchored = listingInputsFromRecord(row);
			if (!anchored) {
				const prior_tx = await this.db.returnTransaction(row.signature, this.app);
				if (!prior_tx) {
					continue;
				}
				const slip_key = slipPublicKey(this.app, row.p2sh_address);
				anchored = anchorInventoryInputs(prior_tx, slip_key, {
					block_id: row.block_id_listed ?? row.block_id,
					transaction_id: row.transaction_id_listed ?? row.transaction_id
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

	async validateListingRow(row) {
		const access_script = row?.access_script || '';
		if (!access_script) {
			return 'listing access_script missing';
		}

		let inputs = listingInputsFromRecord(row);

		if (!inputs) {
			const listing_tx = await this.db.returnTransaction(row.signature, this.app);
			if (!listing_tx) {
				return 'listing transaction not found';
			}

			const listing_txmsg = listing_tx.returnMessage?.() || {};
			const script_address = row.p2sh_address || listing_txmsg.p2sh_address || '';
			const slip_public_key = slipPublicKey(this.app, script_address);
			const anchored = anchorInventoryInputs(listing_tx, slip_public_key, {
				block_id: row.block_id_listed ?? row.block_id,
				transaction_id: row.transaction_id_listed ?? row.transaction_id
			});
			if (anchored) {
				inputs = anchored;
			}
			if (!inputs && !findInventoryTriple(listing_tx.to, slip_public_key)) {
				return 'listing triple not found in transaction';
			}
		}

		if (!(await executeListingScript(this.app, access_script, this.mod.store_public_key))) {
			return 'store cannot execute listing script';
		}

		return '';
	}

	canFulfillOrder(order, summary, quantity) {
		if (!order?.isProcessable?.()) {
			return 'order is not open';
		}

		if (!summary || !summary.isActive()) {
			return 'listing inactive or missing';
		}

		if (Number(summary.quantity_available || 0) < quantity) {
			return 'insufficient available quantity';
		}

		const unit_price = BigInt(order.price ?? 0);
		if (unit_price < BigInt(summary.price ?? 0)) {
			return 'purchase price below listing price';
		}

		const payment_amount = BigInt(order.payment_amount ?? 0);
		const required = BigInt(summary.price ?? 0) * BigInt(quantity);
		if (payment_amount < required) {
			return 'escrowed payment amount insufficient';
		}

		return '';
	}

	async findSpendableListings(nft_id, price, quantity) {
		const need = Number(quantity) || 1;
		const rows = await this.db.returnSpendableListingsForBucket(nft_id, price, need);
		if (!rows?.length) {
			return [];
		}

		let remaining = need;
		const selected = [];

		for (const row of rows) {
			if (remaining <= 0) {
				break;
			}
			const row_qty = Number(row.quantity) || 1;
			if (row_qty > remaining) {
				continue;
			}
			selected.push(row);
			remaining -= row_qty;
		}

		if (remaining > 0) {
			return [];
		}

		return selected;
	}

	bucketKey(nft_id, price) {
		return `${nft_id}:${Number(price)}`;
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

	async updateSummary(summary_id, fields = {}) {
		const row = await this.db.returnSummary(summary_id);
		if (!row) {
			return null;
		}

		const now = Date.now();
		const available =
			fields.quantity_available !== undefined
				? Number(fields.quantity_available)
				: Number(row.quantity_available);
		const pending =
			fields.quantity_pending !== undefined
				? Number(fields.quantity_pending)
				: Number(row.quantity_pending);
		const sold =
			fields.quantity_sold !== undefined ? Number(fields.quantity_sold) : Number(row.quantity_sold);

		await this.db.adjustSummaryQuantities(
			summary_id,
			available - Number(row.quantity_available),
			pending - Number(row.quantity_pending),
			sold - Number(row.quantity_sold),
			now
		);

		return this.db.returnSummary(summary_id);
	}

	async deleteSummary(summary_id) {
		await this.db.deleteSummary(summary_id);
		delete this.summaries[summary_id];
		this.mod.summaries = this.summaries;
	}
}

module.exports = Warehouse;
