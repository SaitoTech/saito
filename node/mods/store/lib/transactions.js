const Listing = require('./listing');
const { LISTING_STATUS_ACTIVE } = Listing;
const Inventory = require('./inventory');
const Sale = require('./sale');
const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const { createListingScript, executeListingScript, returnP2SHTuples } = require('./scripting');
const {
	buildFulfillmentTransaction,
	serializeAnchoredInventorySlips,
	returnChainLocation,
	returnInventorySlipId,
	returnAmountPaidToStore
} = require('./helpers');
const {
	INVENTORY_STATUS_ACTIVE,
	INVENTORY_STATUS_SPENT,
	SALE_STATUS_PENDING
} = require('./warehouse');

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
	                        await this.warehouse.updateListing(nft, tx, txmsg);
	                }

	                //
	                // new inventory position observed
	                //
	                await this.warehouse.addListing(nft, tx, txmsg);

	        } catch (err) {
	                console.log('Store: receiveListAssetTransaction ignored', err?.message);
	        }

	},

	async createPurchaseAssetTransaction(listing, sale = {}, nolan_to_send = 0n) {
		if (!this.store_public_key) {
			throw new Error('Store public key is not configured');
		}

		if (!listing?.id) {
			throw new Error('Listing id is required for purchase');
		}

		const newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			this.store_public_key,
			nolan_to_send
		);

		newtx.msg = {
			module: 'Store',
			request: 'purchase-asset',
			buyer: await this.app.wallet.getPublicKey(),
			refund: await this.app.wallet.getPublicKey(),
			listing_id: listing.id,
			quantity: Number(sale.quantity) || 1,
			price: String(sale.price),
			fee: String(sale.fee)
		};

		await newtx.sign();
		return newtx;
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
		const refund = txmsg.refund;
		const listing_id = txmsg.listing_id || txmsg.listing_signature;
		const quantity = Number(txmsg.quantity) || 1;
		const unit_price = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.price) ?? 0);
		const fee = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.fee) ?? 0);
		const total = unit_price * BigInt(quantity) + fee;

		if (!buyer || !refund || !listing_id) {
			console.warn('Store: purchase missing buyer, refund, or listing_id');
			return;
		}

		if (unit_price <= 0n) {
			console.warn('Store: purchase invalid price');
			return;
		}

		const amount_paid = returnAmountPaidToStore(tx, this.publicKey);

		if (amount_paid < total) {
			console.warn(`Store: purchase underpaid. got=${amount_paid} need=${total}`);
			await this.warehouse.refundBuyer(buyer, listing_id, amount_paid, 'underpaid');
			return;
		}

		const listing = await this.warehouse.returnListing(listing_id);
		if (!listing || !listing.isActive()) {
			console.warn('Store: purchase listing inactive or missing', listing_id);
			await this.warehouse.refundBuyer(buyer, listing_id, amount_paid, 'listing-inactive');
			return;
		}

		const reserved = await this.warehouse.reserveListing(listing_id, quantity);
		if (!reserved) {
			console.warn('Store: purchase could not reserve quantity', listing_id);
			await this.warehouse.refundBuyer(buyer, listing_id, amount_paid, 'insufficient-quantity');
			return;
		}

		const seller = listing.seller || '';
		const chain = returnChainLocation(blk, tx);
		const now = Date.now();

		try {
			await this.warehouse.addOrder(
				new Sale({
					signature: tx.signature,
					buyer,
					seller,
					listing_id,
					quantity,
					price: txmsg.price,
					fee: txmsg.fee,
					refund,
					status: SALE_STATUS_PENDING,
					onchain: 1,
					fulfillment_tx: '',
					retry_count: 0,
					last_attempt: 0,
					block_id: chain.block_id,
					block_hash: chain.block_hash,
					transaction_id: chain.transaction_id,
					created_at: now,
					updated_at: now
				})
			);
			console.log('Store: purchase queued', tx.signature);
		} catch (err) {
			await this.warehouse.restoreReservation(listing_id, quantity);
			if (String(err?.message || err).includes('UNIQUE')) {
				console.log('Store: purchase already queued', tx.signature);
				return;
			}
			console.warn('Store: purchase queue failed', err?.message);
			await this.warehouse.refundBuyer(buyer, listing_id, amount_paid, 'queue-failed');
		}
	},

	createFulfillmentTransaction(params) {
		return buildFulfillmentTransaction({ ...params, app: this.app });
	},

	async createRefundTransaction(buyer, listing_id, amount, reason) {
		if (!buyer || !listing_id || amount <= 0n) {
			return null;
		}

		const refund_tx = await this.app.wallet.createUnsignedTransaction(buyer, amount, BigInt(0));
		refund_tx.msg = {
			module: 'Store',
			request: 'purchase_refund',
			reason,
			listing_id
		};
		await refund_tx.sign();
		return refund_tx;
	}
};
