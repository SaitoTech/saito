const Listing = require('./listing');
const Database = require('./database');
const { syncListingCache } = require('./ui/listing-cache');
const Inventory = require('./inventory');
const Order = require('./order');
const {
	findInventoryTriple,
	anchorInventoryInputs,
	inventoryInputsFromRecord,
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
		this.deposits = {};
	}

	async initialize() {
		if (this.app.BROWSER) {
			return;
		}

		this.mod.listings = {};
		await this.rebuildSummary();
		await initializeImageCache(this.mod);
	}

	async onNewBlock(blk, lc) {
		await this.processOrder();
	}

	async onChainReorganization(block_id, block_hash, longest_chain) {
		await this.db.updateListingsChainState(block_id, block_hash, longest_chain);
		await this.db.updateOrdersAddedChainState(block_id, block_hash, longest_chain);
		await this.db.updateOrdersFulfilledChainState(block_id, block_hash, longest_chain);
		await this.db.updateTransactionsChainState(block_id, block_hash, longest_chain);

		for (const row of Object.values(this.deposits)) {
			if (
				Number(row.block_id) === Number(block_id) &&
				String(row.block_hash || '') === String(block_hash || '')
			) {
				row.longest_chain = longest_chain ? 1 : 0;
			}
		}

		await this.rebuildSummary();
	}

	async addListing(nftOrRow, tx = null, txmsg = null) {
		if (this.app.BROWSER) {
			return null;
		}

		if (tx && txmsg) {
			return this.addListingFromTransaction(nftOrRow, tx, txmsg);
		}

		const row = nftOrRow;
		if (!row?.signature || (await this.depositExists(row.signature))) {
			return null;
		}

		const deposit = new Inventory(row);
		this.deposits[deposit.signature] = deposit;

		try {
			await this.db.insertListingRow(deposit);
		} catch (err) {
			if (String(err?.message || err).includes('UNIQUE')) {
				return null;
			}
			throw err;
		}

		const summary = await this.ensureSummaryForDeposit(deposit);
		await this.updateSummary(summary.id, {
			quantity_available: Number(summary.quantity_available) + Number(deposit.quantity || 1)
		});

		await this.syncSummaryToCache(summary.nft_id, summary.price);
		return deposit;
	}

	async removeListing(nftOrRows, tx = null, txmsg = null) {
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
			if (Number(row.spent) === 1) {
				continue;
			}

			await this.db.markListingSpent(row.signature, now);
			delete this.deposits[row.signature];

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

	async queuePurchase(order) {
		const params = order instanceof Order ? order.toInsertParams() : order;
		await this.db.insertOrder(params);
		return params;
	}

	async executePurchase(order) {
		const escrow = order instanceof Order ? order : new Order(order);
		const quantity = 1;
		const unit_price = BigInt(escrow.price ?? 0);
		const now = Date.now();

		const summary_row = await this.db.returnSummaryByBucket(escrow.nft_id, escrow.price);
		const summary = summary_row ? new Listing(this.app, this.mod, summary_row) : null;
		const reject_reason = this.canFulfillOrder(escrow, summary, quantity, unit_price);

		if (reject_reason) {
			return {
				success: false,
				reject_reason,
				summary,
				listings: [],
				order: escrow
			};
		}

		const selected_rows = await this.findDepositForBucket(escrow.nft_id, escrow.price, quantity);
		if (!selected_rows.length) {
			return {
				success: false,
				reject_reason: 'active listing positions not found',
				summary,
				listings: [],
				order: escrow
			};
		}

		for (const row of selected_rows) {
			const validation = await this.validateDepositRow(row);
			if (validation) {
				return {
					success: false,
					reject_reason: validation,
					summary,
					listings: [],
					order: escrow
				};
			}
		}

		const listings = [];

		for (const row of selected_rows) {
			await this.db.markListingSpent(row.signature, now);
			delete this.deposits[row.signature];
			listings.push(new Inventory(row));
		}

		await this.updateSummary(summary.id, {
			quantity_available: Math.max(0, Number(summary.quantity_available) - quantity),
			quantity_pending: Number(summary.quantity_pending) + quantity
		});

		const refreshed_summary = await this.returnSummary(summary.id);
		await this.syncSummaryToCache(escrow.nft_id, escrow.price);

		return {
			success: true,
			reject_reason: '',
			summary: refreshed_summary,
			listings,
			order: escrow
		};
	}

	async processOrder() {
		if (this.app.BROWSER) {
			return;
		}

		const orders = await this.db.returnOpenOrders();
		if (!orders?.length) {
			return;
		}

		for (const row of orders) {
			const order = new Order(row);
			if (!order.isOpen() || order.settlement_tx_sig) {
				continue;
			}

			const result = await this.executePurchase(order);
			if (!result.success) {
				console.log('Store: processOrder deferred', {
					order: order.order_tx_sig,
					nft_id: order.nft_id,
					price: order.price,
					reason: result.reject_reason
				});
				continue;
			}

			const summary = result.summary;
			const deposit = result.listings[0];
			if (!deposit || !summary) {
				continue;
			}

			const deposit_tx = await this.returnTransaction(deposit.signature);
			const deposit_txmsg = deposit_tx?.returnMessage?.() || {};
			deposit.listing_id = summary.id;

			let outbound_tx = null;

			try {
				outbound_tx = this.mod.createFulfillmentTransaction({
					inventory: deposit,
					inventory_tx: deposit_tx,
					inventory_txmsg: deposit_txmsg,
					listing: summary,
					sale: order,
					buyer: order.buyer,
					quantity: 1
				});
			} catch (err) {
				console.warn('Store: processOrder outbound build failed', err?.message);
				continue;
			}

			if (deposit_tx && summary?.id) {
				const nft = new SaitoNFT(this.app, this.mod, deposit_tx, null);
				const nft_image = nft.returnImage?.() || '';
				if (nft_image) {
					this.mod.image_cache[summary.id] = nft_image;
				}
			}

			await outbound_tx.sign();
			await this.db.updateOrder(order.id, { settlement_tx_sig: outbound_tx.signature });
			await this.insertTransaction(outbound_tx, { onchain: 1 });

			console.log('Store: processOrder propagating outbound tx', outbound_tx.signature);
			this.app.network.propagateTransaction(outbound_tx);
			break;
		}
	}

	async refundBuyer(buyer, summary_id, amount, reason) {
		if (!buyer || !summary_id || amount <= 0n) {
			return;
		}

		console.warn('Store: refunding buyer', { buyer, summary_id, reason });
		try {
			const refund_tx = await this.mod.createRefundTransaction(buyer, summary_id, amount, reason);
			if (refund_tx) {
				this.app.network.propagateTransaction(refund_tx);
			}
		} catch (err) {
			console.warn('Store: refund failed', err?.message);
		}
	}

	async returnSummary(summary_id) {
		if (this.listings[summary_id]) {
			return this.listings[summary_id];
		}

		try {
			const row = await this.db.returnSummary(summary_id);
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

	returnActiveSummaries() {
		return Object.values(this.listings).filter((listing) => listing.isActive());
	}

	async returnActiveDeposit(summary_id) {
		const summary = await this.returnSummary(summary_id);
		if (!summary) {
			return null;
		}

		const row = await this.db.returnActiveListingForBucket(summary.nft_id, summary.price);
		return row ? new Inventory(row) : null;
	}

	async insertTransaction(tx, chain = {}) {
		await this.db.insertTransaction(tx, this.app, chain);
	}

	async returnTransaction(signature) {
		return this.db.returnTransaction(signature, this.app);
	}

	// --- internal ---

	async addListingFromTransaction(nft, tx, txmsg) {
		if (!tx?.signature || (await this.depositExists(tx.signature))) {
			return null;
		}

		const access_script = txmsg.access_script || '';
		if (!(await executeListingScript(this.app, access_script, this.mod.store_public_key))) {
			return null;
		}

		const observation = this.observeDepositFromTransaction(nft, tx, txmsg);
		if (!observation) {
			return null;
		}

		const deposit = await this.addListing(observation);
		if (!deposit) {
			return null;
		}

		const summary = await this.db.returnSummaryByBucket(deposit.nft_id, deposit.price);
		const image = nft.returnImage?.() || '';
		if (image && summary?.id) {
			this.mod.image_cache[summary.id] = image;
		}

		return deposit;
	}

	async rebuildSummary() {
		const buckets = await this.db.scanListingsForSummaryRebuild();
		const existing = await this.db.loadAllSummaries();
		const existing_by_bucket = {};

		for (const row of existing || []) {
			existing_by_bucket[this.bucketKey(row.nft_id, row.price)] = row;
		}

		await this.db.clearSummaries();
		this.listings = {};

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
				const listing = new Listing(this.app, this.mod, row);
				this.listings[listing.id] = listing;
				syncListingCache(this.mod, listing);
			}
		}

		this.mod.listings = this.listings;
	}

	async syncSummaryToCache(nft_id, price) {
		const row = await this.db.returnSummaryByBucket(nft_id, price);
		if (!row) {
			return null;
		}

		const listing = new Listing(this.app, this.mod, row);
		this.listings[listing.id] = listing;
		this.mod.listings = this.listings;
		syncListingCache(this.mod, listing);
		return listing;
	}

	async ensureSummaryForDeposit(deposit) {
		const existing = await this.db.returnSummaryByBucket(deposit.nft_id, deposit.price);
		if (existing) {
			return existing;
		}

		const now = Date.now();
		await this.db.insertSummary({
			nft_id: deposit.nft_id,
			price: deposit.price,
			title: '',
			description: '',
			image: null,
			quantity_available: 0,
			quantity_pending: 0,
			quantity_sold: 0,
			updated_at: now
		});

		return this.db.returnSummaryByBucket(deposit.nft_id, deposit.price);
	}

	observeDepositFromTransaction(nft, tx, txmsg) {
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

	async matchSpentListings(tx) {
		const tuples = returnP2SHTuples(tx);
		if (!tuples.inputs?.length) {
			return [];
		}

		const rows = await this.db.returnAllActiveListingRows();
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

	async validateDepositRow(row) {
		const access_script = row?.access_script || '';
		if (!access_script) {
			return 'listing access_script missing';
		}

		let inputs = inventoryInputsFromRecord(row);

		if (!inputs) {
			const deposit_tx = await this.returnTransaction(row.signature);
			if (!deposit_tx) {
				return 'listing transaction not found';
			}

			const deposit_txmsg = deposit_tx.returnMessage?.() || {};
			const script_address = row.p2sh_address || deposit_txmsg.p2sh_address || '';
			const slip_public_key = slipPublicKey(this.app, script_address);
			const anchored = anchorInventoryInputs(deposit_tx, slip_public_key, {
				block_id: row.block_id,
				transaction_id: row.transaction_id
			});
			if (anchored) {
				inputs = anchored;
			}
			if (!inputs && !findInventoryTriple(deposit_tx.to, slip_public_key)) {
				return 'listing triple not found in transaction';
			}
		}

		if (!(await executeListingScript(this.app, access_script, this.mod.store_public_key))) {
			return 'store cannot execute listing script';
		}

		return '';
	}

	bucketKey(nft_id, price) {
		return `${nft_id}:${Number(price)}`;
	}

	async depositExists(signature) {
		if (!signature) {
			return false;
		}
		if (this.deposits[signature]) {
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
		delete this.listings[summary_id];
		this.mod.listings = this.listings;
	}

	canFulfillOrder(order, summary, quantity, unit_price) {
		if (!order?.isOpen?.()) {
			return 'order is not open';
		}

		if (!summary || !summary.isActive()) {
			return 'listing inactive or missing';
		}

		if (Number(summary.quantity_available || 0) < quantity) {
			return 'insufficient available quantity';
		}

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

	async findDepositForBucket(nft_id, price, quantity) {
		const need = Number(quantity) || 1;
		const row = await this.db.returnActiveListingForBucket(nft_id, price);
		if (!row || Number(row.quantity) < need) {
			return [];
		}

		return [row];
	}
}

module.exports = Warehouse;
