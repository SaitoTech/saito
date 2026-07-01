const Order = require('./order');
const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const {
	createListingScript,
	createPurchaseScript,
	executeListingScript,
	returnP2SHTuples
} = require('./scripting');
const {
	buildFulfillmentTransaction,
	buildOrderRefundTransaction,
	returnChainLocation,
	returnAmountPaidInPurchase,
	returnPaymentUtxoFromPurchase,
	serializePaymentSlip,
	slipPublicKey
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
		let newtx = await this.app.wallet.createNFTTransaction(
			nft,
			script_info.p2sh_address,
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
	                console.log('Store: receiveListAssetTransaction ignored', err?.message);
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

	async createOrderRefundTransaction(params) {
		return buildOrderRefundTransaction({ ...params, app: this.app });
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
		if (!summary || !summary.isActive()) {
			console.warn('Store: purchase summary inactive or missing', listing_id);
			await refund('listing-inactive');
			return;
		}

		if (Number(summary.quantity_available || 0) < quantity) {
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

	async createFulfillmentTransaction(params) {
		return buildFulfillmentTransaction({ ...params, app: this.app });
	}
};
