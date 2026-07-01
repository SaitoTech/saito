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

			const chain = tx ? returnChainLocation(blk, tx) : {};
			await this.db.markListingSold(row.signature, chain, now);
			delete this.listings[row.signature];

			const summary = await this.db.returnSummaryByBucket(row.nft_id, row.price);
			if (summary?.id) {
				await this.syncSummaryForBucket(row.nft_id, row.price);
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
		const consumed_signatures = Array.isArray(fulfill.listing_signatures)
			? fulfill.listing_signatures.filter(Boolean)
			: prior_listing
				? [prior_listing]
				: [];

		for (const signature of consumed_signatures) {
			await this.db.markListingSold(signature, chain, now);
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

		for (const row of orders) {
			const order = new Order(row);

			if (!order.isProcessable()) {
				if (order.isAwaitingSettlementConfirmation()) {
					continue;
				}

				if (order.isPending() && order.isReceivedOnChain() && !order.isFulfilledOnChain()) {
					const listing_rows = await this.findSpendableListingsForOrder(order);
					if (!listing_rows.length) {
						await this.deferOrder(order, retry_limit);
					}
				}
				continue;
			}

			const listing_rows = await this.findSpendableListingsForOrder(order);

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
		const settlement_tx = await this.db.returnTransaction(order_row.settlement_tx_sig, this.app);
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
		const fulfill_price = Number(listing_rows[0]?.price ?? order.price ?? 0);
		const summary_row = await this.db.returnSummaryByBucket(order.nft_id, fulfill_price);
		const summary = summary_row ? new Summary(this.app, this.mod, summary_row) : null;
		const reject_reason = await this.canFulfillOrder(order, summary, quantity, fulfill_price);

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

		const listing_tx = await this.db.returnTransaction(primary.signature, this.app);
		const listing_txmsg = listing_tx?.returnMessage?.() || {};
		const payment_tx = await this.db.returnTransaction(order.payment_tx_sig, this.app);
		const listings = listing_rows.map((row) => {
			const listing_row = new Listing(row);
			listing_row.take_qty = Number(row.take_qty ?? row.quantity ?? 1);
			listing_row.summary_id = summary.id;
			return listing_row;
		});
		const listing = listings[0];

		let outbound_tx = null;

		try {
			outbound_tx = await this.mod.createFulfillmentTransaction({
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
			return false;
		}

		for (const row of listing_rows) {
			await this.db.markListingSettlementPending(row.signature, now);
			if (this.listings[row.signature]) {
				this.listings[row.signature].block_id_sold = -1;
			}
		}
		await this.syncSummaryForBucket(order.nft_id, fulfill_price);

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

	async canFulfillOrder(order, summary, quantity, fulfill_price = null) {
		if (!order?.isProcessable?.()) {
			return 'order is not open';
		}

		if (!summary) {
			return 'listing inactive or missing';
		}

		const bucket_price = Number(fulfill_price ?? summary.price ?? order.price ?? 0);
		const available = await this.returnAvailableQuantity(order.nft_id, bucket_price);
		if (available < quantity) {
			return 'insufficient available quantity';
		}

		const unit_price = BigInt(order.price ?? 0);
		if (unit_price < BigInt(summary.price ?? 0)) {
			return 'purchase price below listing price';
		}

		const payment_amount = BigInt(order.payment_amount ?? 0);
		const required = BigInt(order.price ?? 0) * BigInt(quantity);
		if (payment_amount < required) {
			return 'escrowed payment amount insufficient';
		}

		return '';
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
			await this.db.updateSummaryAvailable(row.id, available, now);
			if (available <= 0) {
				const refreshed = await this.db.returnSummary(row.id);
				const has_metadata = !!(
					refreshed?.title ||
					refreshed?.description ||
					refreshed?.image
				);
				if (!has_metadata) {
					await this.deleteSummary(row.id);
					return null;
				}
			}
		}

		return this.syncSummaryToCache(nft_id, price);
	}

	async findSpendableListingsForOrder(order) {
		const nft_id = order.nft_id;
		const max_price = Number(order.price ?? 0);
		const quantity = Number(order.quantity) || 1;

		const fulfill_price = await this.db.returnLowestSatisfyingPriceForNft(
			nft_id,
			max_price,
			quantity
		);
		if (fulfill_price === null) {
			return [];
		}

		return this.findSpendableListings(nft_id, fulfill_price, quantity);
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
			const take_qty = Math.min(row_qty, remaining);
			selected.push({ ...row, take_qty });
			remaining -= take_qty;
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

	async deleteSummary(summary_id) {
		await this.db.deleteSummary(summary_id);
		delete this.summaries[summary_id];
		this.mod.summaries = this.summaries;
	}
}

module.exports = Warehouse;
