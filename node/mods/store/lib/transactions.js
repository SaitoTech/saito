const Order = require('./order');
const Slip = require('../../../lib/saito/slip').default;
const Transaction = require('../../../lib/saito/transaction').default;
const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const { SlipType } = require('saito-js/lib/slip');
const { TransactionType } = require('saito-js/lib/transaction');
const {
	createListingScript,
	createPurchaseScript,
	executeListingScript,
	returnP2SHTuples
} = require('./scripting');
const {
	attachP2shAccessScripts,
	returnChainLocation,
	returnAmountPaidInPurchase,
	returnPaymentUtxoFromPurchase,
	serializePaymentSlip,
	slipPublicKey,
	SLIP_TYPE_P2SH,
	findInventoryTriple,
	listingInputsFromRecord,
	paymentInputFromOrder,
	slipToStoredJson
} = require('./helpers');

module.exports = {


	async createListAssetTransaction(nft, listing = {}) {

		//
		// ensure NFT is loaded
		//
		if (!nft.tx) {
			throw new Error('NFT transaction is missing — cannot list without original NFT data');
		}

		//
		// create the listing script
		//
		const script_info = createListingScript(this.app, {
			seller_publickey: await this.app.wallet.getPublicKey(),
			store_publickey: this.store_public_key
		});

		//
		// create the listing txmsg
		//
		const txmsg = JSON.parse(JSON.stringify(nft.txmsg));
		txmsg.module = 'Store';
		txmsg.request = 'list-asset';
		txmsg.access_script = script_info.access_script;
		txmsg.access_hash = script_info.access_hash;
		txmsg.p2sh_address = script_info.p2sh_address;
		txmsg.listing = listing;

		//
		// create the listing tx
		//
		const slip_public_key =
			slipPublicKey(this.app, script_info.p2sh_address) || script_info.p2sh_address;
		if (
			!slip_public_key ||
			(slip_public_key === script_info.p2sh_address &&
				script_info.p2sh_address?.length === 66 &&
				script_info.p2sh_address?.startsWith('00'))
		) {
			console.log(
				'Store: createListAssetTransaction slipPublicKey failed',
				script_info.p2sh_address,
				slip_public_key
			);
			throw new Error('invalid recipient public key');
		}
		let newtx = await this.app.wallet.createNFTTransaction(
			nft,
			slip_public_key,
			nft.amount ,
			BigInt(0),
			BigInt(0),
			txmsg
		);
		newtx = await nft.modifyBeforeSend(newtx, this.store_public_key);
		await newtx.sign();

		console.log('Store: createListAssetTransaction complete', newtx.signature);
		return newtx;
	},

	async receiveListAssetTransaction(blk, tx) {

	        console.log('Store: receiveListAssetTransaction start', tx.signature);

	        const nft = new SaitoNFT(this.app, this, tx, null);
	        const txmsg = tx.returnMessage();

	        if (txmsg.fulfill_sale) {
	                await this.warehouse.confirmSettlement(blk, tx);
	                await this.warehouse.addListing(nft, tx, txmsg, blk);
	                return;
	        }

	        //
	        // determine if existing inventory is being modified
	        //
	        try {

	                const tuples = returnP2SHTuples(tx);
	                const p2sh_address = this.app.core.scripting.address(txmsg.access_script || '');

	                //
	                // inventory moved from one listing position to another
	                //
	                if (
	                        tuples.inputs.some(t => t.p2sh_public_key === p2sh_address) &&
	                        tuples.outputs.some(t => t.p2sh_public_key === p2sh_address) &&
	                        await executeListingScript(
	                                this.app,
	                                txmsg.access_script || '',
	                                this.store_public_key
	                        )
	                ) {
	                        await this.warehouse.removeListing(nft, tx, txmsg, blk);
	                }

	                //
	                // new inventory position observed
	                //
	                await this.warehouse.addListing(nft, tx, txmsg, blk);

	        } catch (err) {
	                console.error('Store: receiveListAssetTransaction failed', err);
	                if (err?.stack) {
	                        console.error(err.stack);
	                }
	        }

	},

	async createPurchaseAssetTransaction(summary, sale = {}, nolan_to_send = 0n) {
		if (!this.store_public_key) {
			throw new Error('Store public key is not configured');
		}

		if (!summary?.id) {
			throw new Error('Summary id is required for purchase');
		}

		const buyer_publickey = await this.app.wallet.getPublicKey();
		const script_info = createPurchaseScript(this.app, {
			buyer_publickey,
			store_publickey: this.store_public_key
		});
		const payment_recipient =
			slipPublicKey(this.app, script_info.p2sh_address) || script_info.p2sh_address;

		const newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			payment_recipient,
			nolan_to_send
		);

		newtx.msg = {
			module: 'Store',
			request: 'purchase-asset',
			buyer: buyer_publickey,
			refund: buyer_publickey,
			listing_id: summary.id,
			quantity: Number(sale.quantity) || 1,
			price: String(sale.price),
			fee: String(sale.fee),
			access_script: script_info.access_script,
			access_hash: script_info.access_hash,
			p2sh_address: script_info.p2sh_address
		};

		await newtx.sign();
		return newtx;
	},

	orderFromPurchaseTx(tx, txmsg, payment_utxo, chain) {
		const buyer = txmsg.buyer || tx.from?.[0]?.publicKey || '';
		return new Order({
			order_tx_sig: tx.signature,
			buyer,
			payment_tx_sig: payment_utxo.payment_tx_sig,
			payment_output_index: payment_utxo.payment_output_index,
			payment_amount: Number(payment_utxo.payment_amount),
			payment_utxo_slip: serializePaymentSlip(tx, payment_utxo.payment_output_index, chain),
			block_id_received: chain.block_id,
			block_hash_received: chain.block_hash,
			transaction_id_received: chain.transaction_id,
			longest_chain_received: 1
		});
	},

	async createOrderRefundTransaction({
		order,
		payment_tx = null,
		refund_public_key = '',
		reason = 'unable-to-fulfill'
	} = {}) {
		if (!order) {
			return null;
		}

		const payment_input = paymentInputFromOrder(order, payment_tx);
		if (!payment_input) {
			throw new Error('payment input not available');
		}

		const refund_to = refund_public_key || order.buyer || '';
		if (!refund_to) {
			throw new Error('refund recipient not available');
		}

		const amount = BigInt(order.payment_amount ?? payment_input.amount ?? 0);
		if (amount <= 0n) {
			throw new Error('refund amount not available');
		}

		const tx = new Transaction();
		tx.timestamp = Date.now();

		tx.addFromSlip(payment_input);

		const refund_slip = new Slip();
		refund_slip.publicKey = refund_to;
		refund_slip.amount = amount;
		refund_slip.type = SlipType.Normal;
		tx.addToSlip(refund_slip);

		tx.msg = {
			module: 'Store',
			request: 'order-refund',
			type: 'order-refund',
			order_tx_sig: order.order_tx_sig || order.signature || '',
			buyer: order.buyer || '',
			refund: refund_to,
			reason,
			payment_tx_sig: order.payment_tx_sig || order.order_tx_sig || '',
			payment_output_index: Number(order.payment_output_index ?? 0),
			payment_amount: String(order.payment_amount ?? 0)
		};

		const payment_txmsg =
			(typeof payment_tx?.returnMessage === 'function' ? payment_tx.returnMessage() : payment_tx?.msg) ||
			{};
		const payment_access_script = payment_txmsg.access_script || '';
		const payment_pubkey = slipPublicKey(this.app, payment_txmsg.p2sh_address || '');
		if (!payment_pubkey || !payment_access_script) {
			throw new Error('payment access script not available');
		}

		await attachP2shAccessScripts(this.app, tx, {
			[payment_pubkey]: payment_access_script
		});

		return tx;
	},

	async propagateOrderRefund(order, { payment_tx = null, refund_public_key = '', reason = 'unable-to-fulfill' } = {}) {
		if (this.app.BROWSER) {
			return;
		}

		const refund_tx = await this.createOrderRefundTransaction({
			order,
			payment_tx,
			refund_public_key,
			reason
		});
		if (!refund_tx) {
			return;
		}

		await refund_tx.sign();
		await this.warehouse.db.insertTransaction(refund_tx, this.app, { onchain: 1 });
		this.app.network.propagateTransaction(refund_tx);
		console.log('Store: propagating order refund', refund_tx.signature, reason);
	},

	async receivePurchaseAssetTransaction(blk, tx) {
		if (this.app.BROWSER) {
			return;
		}

		const txmsg = tx.returnMessage?.() || {};

		if (txmsg.module !== 'Store' || txmsg.request !== 'purchase-asset') {
			return;
		}

		const buyer = txmsg.buyer || tx.from?.[0]?.publicKey;
		const listing_id = txmsg.listing_id || txmsg.listing_signature;
		const quantity = Number(txmsg.quantity) || 1;
		const unit_price = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.price) ?? 0);
		const fee = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.fee) ?? 0);
		const total = unit_price * BigInt(quantity) + fee;
		const chain = returnChainLocation(blk, tx);
		const refund_public_key = txmsg.refund || buyer;

		if (!buyer || !listing_id) {
			console.warn('Store: purchase missing buyer or listing_id');
			return;
		}

		if (unit_price <= 0n) {
			console.warn('Store: purchase invalid price');
			return;
		}

		const amount_paid = returnAmountPaidInPurchase(tx, txmsg, this.app);
		const payment_utxo = returnPaymentUtxoFromPurchase(tx, txmsg, this.app);
		const refund_order = payment_utxo
			? this.orderFromPurchaseTx(tx, txmsg, payment_utxo, chain)
			: null;

		const refund = async (reason) => {
			if (!refund_order) {
				console.warn('Store: cannot refund purchase without payment UTXO', reason);
				return;
			}
			try {
				await this.propagateOrderRefund(refund_order, {
					payment_tx: tx,
					refund_public_key,
					reason
				});
			} catch (err) {
				console.warn('Store: purchase refund failed', reason, err?.message);
			}
		};

		if (amount_paid < total) {
			console.warn(`Store: purchase underpaid. got=${amount_paid} need=${total}`);
			await refund('underpaid');
			return;
		}

		if (!payment_utxo) {
			console.warn('Store: purchase payment UTXO not found');
			return;
		}

		const summary = await this.warehouse.returnSummary(listing_id);
		const available = summary
			? await this.warehouse.returnAvailableQuantity(summary.nft_id, summary.price)
			: 0;
		if (!summary || available <= 0) {
			console.warn('Store: purchase summary inactive or missing', listing_id);
			await refund('listing-inactive');
			return;
		}

		if (available < quantity) {
			console.warn('Store: purchase insufficient available quantity', listing_id);
			await refund('insufficient-quantity');
			return;
		}

		const now = Date.now();

		try {
			await this.warehouse.addOrder(
				new Order({
					order_tx_sig: tx.signature,
					buyer,
					nft_id: summary.nft_id,
					price: Number(summary.price ?? 0),
					quantity,
					payment_tx_sig: payment_utxo.payment_tx_sig,
					payment_output_index: payment_utxo.payment_output_index,
					payment_amount: Number(payment_utxo.payment_amount),
					payment_utxo_slip: refund_order.payment_utxo_slip,
					block_id_received: chain.block_id,
					block_hash_received: chain.block_hash,
					transaction_id_received: chain.transaction_id,
					longest_chain_received: 1,
					settlement_tx_sig: '',
					block_id_fulfilled: 0,
					block_hash_fulfilled: '',
					transaction_id_fulfilled: 0,
					longest_chain_fulfilled: 0,
					created_at: now,
					updated_at: now
				})
			);
			await this.warehouse.db.insertTransaction(tx, this.app, {
				onchain: 1,
				block_id: chain.block_id,
				block_hash: chain.block_hash,
				transaction_id: chain.transaction_id
			});
			console.log('Store: escrow payment recorded', tx.signature);
		} catch (err) {
			if (String(err?.message || err).includes('UNIQUE')) {
				console.log('Store: escrow payment already recorded', tx.signature);
				return;
			}
			console.warn('Store: escrow payment record failed', err?.message);
			await refund('queue-failed');
		}
	},

	async createFulfillmentTransaction({
		listing_tx = null,
		listing_txmsg = {},
		listing,
		listings = null,
		summary = null,
		sale,
		buyer,
		quantity,
		payment_tx = null
	} = {}) {
		const allocations = (Array.isArray(listings) && listings.length ? listings : listing ? [listing] : []).map(
			(row) => ({
				listing: row,
				take_qty: Number(row.take_qty ?? row.quantity ?? 0)
			})
		);
		if (!allocations.length) {
			throw new Error('listing position not available');
		}

		const primary = allocations[0].listing;
		const buy_qty = Number(quantity) || 1;
		const allocated_total = allocations.reduce((sum, row) => sum + row.take_qty, 0);
		if (buy_qty <= 0 || allocated_total !== buy_qty) {
			throw new Error('invalid fulfillment quantity');
		}

		let buyer_template = listingInputsFromRecord(primary);
		if (!buyer_template && listing_tx) {
			const script_address = primary.p2sh_address || listing_txmsg?.listing?.pay_descriptor || '';
			const slip_public_key = slipPublicKey(this.app, script_address) || script_address;
			buyer_template = findInventoryTriple(listing_tx.to, slip_public_key);
		}
		if (!buyer_template) {
			throw new Error('listing position not available');
		}

		const tx = new Transaction();
		tx.timestamp = Date.now();
		tx.type = TransactionType.Bound;

		const payment_input = paymentInputFromOrder(sale, payment_tx);
		if (!payment_input) {
			throw new Error('payment input not available');
		}
		tx.addFromSlip(payment_input);

		const script_by_pubkey = {};
		const partial_relists = [];

		for (const allocation of allocations) {
			const listing_row = allocation.listing;
			const take_qty = allocation.take_qty;
			const row_qty = Number(listing_row.quantity) || 1;
			if (take_qty <= 0 || take_qty > row_qty) {
				throw new Error('invalid fulfillment quantity');
			}

			const row_triple = listingInputsFromRecord(listing_row);
			if (!row_triple) {
				throw new Error('listing position not available');
			}

			const row_script_address = listing_row.p2sh_address || '';
			const row_slip_public_key =
				slipPublicKey(this.app, row_script_address) || row_script_address;
			const row_access_script = listing_row.access_script || '';
			if (row_slip_public_key && row_access_script) {
				script_by_pubkey[row_slip_public_key] = row_access_script;
			}

			for (const input of row_triple) {
				tx.addFromSlip(input);
			}

			const p2sh_marker = new Slip();
			p2sh_marker.type = SLIP_TYPE_P2SH;
			p2sh_marker.amount = BigInt(0);
			p2sh_marker.publicKey = row_slip_public_key;
			tx.addFromSlip(p2sh_marker);

			const remainder = row_qty - take_qty;
			if (remainder > 0) {
				if (partial_relists.length) {
					throw new Error('multiple partial listing consumptions are not supported');
				}
				partial_relists.push({
					allocation,
					row_triple,
					row_slip_public_key,
					remainder
				});
			}
		}

		const buyer_out1 = new Slip(undefined, slipToStoredJson(buyer_template[0]));
		buyer_out1.amount = BigInt(buy_qty);
		const buyer_out2 = new Slip(undefined, slipToStoredJson(buyer_template[1]));
		buyer_out2.publicKey = buyer;
		const buyer_out3 = new Slip(undefined, slipToStoredJson(buyer_template[2]));
		for (const out of [buyer_out1, buyer_out2, buyer_out3]) {
			tx.addToSlip(out);
		}

		for (const relist of partial_relists) {
			const relist_out1 = new Slip(undefined, slipToStoredJson(relist.row_triple[0]));
			relist_out1.amount = BigInt(relist.remainder);
			const relist_out2 = new Slip(undefined, slipToStoredJson(relist.row_triple[1]));
			relist_out2.publicKey = relist.row_slip_public_key;
			const relist_out3 = new Slip(undefined, slipToStoredJson(relist.row_triple[2]));
			for (const out of [relist_out1, relist_out2, relist_out3]) {
				tx.addToSlip(out);
			}
		}

		const partial_allocation = partial_relists[0]?.allocation || null;

		const unit_price = BigInt(sale?.price ?? summary?.price ?? primary.price ?? 0);
		const seller_amounts = new Map();
		for (const allocation of allocations) {
			const seller = allocation.listing.seller || '';
			if (!seller) {
				continue;
			}
			const prior = seller_amounts.get(seller) || 0n;
			seller_amounts.set(seller, prior + unit_price * BigInt(allocation.take_qty));
		}
		for (const [seller, amount] of seller_amounts.entries()) {
			if (amount <= 0n) {
				continue;
			}
			const seller_slip = new Slip();
			seller_slip.publicKey = seller;
			seller_slip.amount = amount;
			seller_slip.type = SlipType.Normal;
			tx.addToSlip(seller_slip);
		}

		const listing_price_nolan = Number(summary?.price ?? primary.price ?? sale?.price ?? 0);
		const relist_source = partial_allocation?.listing || primary;
		const relist_remainder = partial_allocation
			? Number(partial_allocation.listing.quantity) - partial_allocation.take_qty
			: 0;
		const script_address = relist_source.p2sh_address || listing_txmsg?.listing?.pay_descriptor || '';
		const access_script = relist_source.access_script || listing_txmsg?.access_script || '';

		const base_listing = listing_txmsg?.listing || {
			id: primary.summary_id,
			nft_id: primary.nft_id || summary?.nft_id,
			title: summary?.title,
			description: summary?.description,
			price: listing_price_nolan,
			denomination: 'SAITO',
			pay_descriptor: script_address
		};

		tx.msg = JSON.parse(JSON.stringify(listing_txmsg || {}));
		tx.msg.module = 'Store';
		tx.msg.request = 'list-asset';
		tx.msg.fulfill_sale = {
			sale_signature: sale.order_tx_sig || sale.signature,
			prior_inventory: primary.signature,
			listing_signatures: allocations.map((row) => row.listing.signature),
			buyer,
			quantity: buy_qty,
			seller: relist_source.seller || primary.seller || ''
		};

		if (relist_remainder > 0) {
			tx.msg.access_script = access_script;
			tx.msg.access_hash = relist_source.access_hash || listing_txmsg?.access_hash || '';
			tx.msg.p2sh_address = script_address;
			tx.msg.listing = {
				...base_listing,
				id: primary.summary_id || base_listing.id,
				nft_id: primary.nft_id || base_listing.nft_id,
				title: summary?.title || base_listing.title,
				description: summary?.description || base_listing.description,
				price: listing_price_nolan,
				denomination: base_listing.denomination || 'SAITO',
				pay_descriptor: script_address,
				nft_amount: relist_remainder,
				quantity: relist_remainder
			};
		} else {
			tx.msg.access_script = primary.access_script || listing_txmsg?.access_script || '';
			tx.msg.access_hash = primary.access_hash || listing_txmsg?.access_hash || '';
			tx.msg.p2sh_address = primary.p2sh_address || script_address;
			tx.msg.listing = {
				...base_listing,
				id: primary.summary_id || base_listing.id,
				nft_id: primary.nft_id || base_listing.nft_id,
				title: summary?.title || base_listing.title,
				description: summary?.description || base_listing.description,
				price: listing_price_nolan,
				denomination: base_listing.denomination || 'SAITO',
				pay_descriptor: primary.p2sh_address || script_address,
				nft_amount: 0,
				quantity: 0
			};
		}

		const payment_txmsg =
			(typeof payment_tx?.returnMessage === 'function' ? payment_tx.returnMessage() : payment_tx?.msg) ||
			{};
		const payment_access_script = payment_txmsg.access_script || '';
		const payment_pubkey = slipPublicKey(this.app, payment_txmsg.p2sh_address || '');
		if (payment_pubkey && payment_access_script) {
			script_by_pubkey[payment_pubkey] = payment_access_script;
		}

		await attachP2shAccessScripts(this.app, tx, script_by_pubkey);
		return tx;
	}
};
