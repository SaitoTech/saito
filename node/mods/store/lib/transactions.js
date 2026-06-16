const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const { generateListingScript, storeCanSpendListingScript } = require('./scripting');
const Listing = require('./listing');

const LISTING_STATUS_ACTIVE = 1;
const LISTING_STATUS_SPENT = 2;

const SALE_STATUS_PENDING = 0;
const SALE_STATUS_FULFILLING = 1;
const SALE_STATUS_FINALIZED = 2;
const SALE_STATUS_FAILED = 3;

const SALE_MAX_RETRIES = 50;

module.exports = {

	async createListAssetTransaction(nft, listing = {}) {
		const title = listing.title;
		const description = listing.description;
		const price = listing.price;
		const quantity = listing.quantity;

		console.log('Store: createListAssetTransaction start', {
			nft_id: nft?.id,
			title,
			price,
			quantity
		});

		if (!this.store_public_key) {
			throw new Error('Store public key is not configured');
		}

		if (!nft.txmsg?.data) {
			throw new Error('NFT payload is missing — cannot list without original NFT data');
		}

		const seller_publickey = await this.app.wallet.getPublicKey();
		const store_publickey = this.store_public_key;
		const nft_id = nft.id;

		console.log('Store: createListAssetTransaction generating listing script', {
			nft_id,
			seller_publickey,
			store_publickey
		});

		const script_info = generateListingScript(this.app, {
			nft_id,
			seller_publickey,
			store_publickey,
			timestamp: Date.now()
		});

		const p2sh_address = script_info.pay_descriptor;

		console.log('Store: createListAssetTransaction script ready', {
			pay_descriptor: p2sh_address,
			access_hash: script_info.access_hash
		});

		const txmsg = JSON.parse(JSON.stringify(nft.txmsg));
		txmsg.module = 'Store';
		txmsg.request = 'list-asset';
		txmsg.access_script = script_info.access_script;
		txmsg.access_hash = script_info.access_hash;
		txmsg.listing = {
			title,
			description,
			price,
			quantity,
			denomination: 'SAITO',
			nft_id,
			nft_amount: quantity,
			pay_descriptor: script_info.pay_descriptor,
			listing_timestamp: script_info.timestamp
		};

		console.log('Store: createListAssetTransaction creating NFT transaction', {
			p2sh_address,
			quantity
		});

		let newtx = await this.app.wallet.createNFTTransaction(
			nft,
			p2sh_address,
			quantity,
			BigInt(0),
			BigInt(0),
			txmsg
		);

		newtx = await nft.modifyBeforeSend(newtx, p2sh_address);
		if (!newtx) {
			throw new Error('NFT transfer blocked before listing');
		}

		console.log('Store: createListAssetTransaction signing');
		await newtx.sign();
		console.log('Store: createListAssetTransaction complete', newtx.signature);
		return newtx;
	},

	async receiveListAssetTransaction(blk, tx) {
		if (this.app.BROWSER) {
			return;
		}

		console.log('Store: receiveListAssetTransaction start', tx.signature);

		try {
			const txmsg = tx.returnMessage();
			const seller = tx.from[0].publicKey;
			const listing_meta = txmsg.listing || {};
			const nft_id = listing_meta.nft_id;
			const quantity = listing_meta.nft_amount ?? listing_meta.quantity;
			const price = listing_meta.price;
			const title = listing_meta.title;
			const description = listing_meta.description;
			const denomination = listing_meta.denomination;
			const access_hash = txmsg.access_hash;
			const access_script = txmsg.access_script;
			const pay_descriptor = listing_meta.pay_descriptor;
			const now = Date.now();
			const signature = tx.signature;
			const chain = this.returnChainLocation(blk, tx);
			const slip_id = this.returnListingSlipId(tx, pay_descriptor);

			console.log('Store: receiveListAssetTransaction extracted', {
				signature,
				nft_id,
				seller,
				title,
				quantity,
				price,
				pay_descriptor
			});

			if (!(await storeCanSpendListingScript(this.app, this.store_public_key, access_script))) {
				console.log('Store: receiveListAssetTransaction ignored (not store inventory)', {
					store_public_key: this.store_public_key,
					signature
				});
				return;
			}

			console.log('Store: receiveListAssetTransaction accepted for inventory', signature);

			const listing = new Listing(this.app, this, {
				signature,
				nft_id,
				seller,
				title,
				description,
				price,
				denomination,
				quantity,
				access_hash,
				access_script,
				pay_descriptor,
				block_id: chain.block_id,
				block_hash: chain.block_hash,
				transaction_id: chain.transaction_id,
				slip_id,
				onchain: 1,
				created_at: now,
				updated_at: now,
				status: LISTING_STATUS_ACTIVE,
				image: null,
				nft: null
			});

			this.addListing(listing);
			await this.insertListing(listing);
			await this.insertTransaction(tx, chain);

			const nft = new SaitoNFT(this.app, this, tx, null);
			const image = nft.returnImage?.() || '';
			if (image) {
				this.image_cache[signature] = image;
			}

			console.log('Store: receiveListAssetTransaction persisted', listing.signature);
		} catch (err) {
			console.log('Store: receiveListAssetTransaction ignored (extract/persist failed)', err?.message);
		}
	},

	async createPurchaseAssetTransaction(listing, price_breakdown, nolan_to_send = 0n, quantity = 1) {
		const { price, fee } = price_breakdown;
		const buyer = await this.app.wallet.getPublicKey();
		const to_address = this.store_public_key;

		if (!to_address) {
			throw new Error('Store public key is not configured');
		}

		const listing_signature = listing?.signature;
		if (!listing_signature) {
			throw new Error('Listing signature is required for purchase');
		}

		const newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			to_address,
			nolan_to_send
		);

		newtx.msg = {
			module: 'Store',
			request: 'purchase-asset',
			buyer,
			refund: buyer,
			listing_signature,
			quantity,
			price: String(price),
			fee: String(fee)
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
		const listing_signature = txmsg.listing_signature;
		const quantity = Number(txmsg.quantity) || 1;
		const unit_price = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.price) ?? 0);
		const fee = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.fee) ?? 0);
		const total = unit_price * BigInt(quantity) + fee;

		if (!buyer || !refund || !listing_signature) {
			console.warn('Store: purchase missing buyer, refund, or listing_signature');
			return;
		}

		if (unit_price <= 0n) {
			console.warn('Store: purchase invalid price');
			return;
		}

		const amount_paid = this.returnAmountPaidToStore(tx);

		if (amount_paid < total) {
			console.warn(`Store: purchase underpaid. got=${amount_paid} need=${total}`);
			await this.refundBuyer(buyer, listing_signature, amount_paid, 'underpaid');
			return;
		}

		const listing = await this.returnListing(listing_signature);
		const seller = listing?.seller || '';
		const chain = this.returnChainLocation(blk, tx);
		const now = Date.now();

		try {
			await this.app.storage.runDatabase(
				`INSERT INTO sales (
				  signature, buyer, seller, listing, quantity,
				  price, fee, refund, status, onchain,
				  fulfillment_tx, retry_count, last_attempt,
				  block_id, block_hash, transaction_id, created_at, updated_at
				) VALUES (
				  $signature, $buyer, $seller, $listing, $quantity,
				  $price, $fee, $refund, $status, $onchain,
				  $fulfillment_tx, $retry_count, $last_attempt,
				  $block_id, $block_hash, $transaction_id, $created_at, $updated_at
				)`,
				{
					$signature: tx.signature,
					$buyer: buyer,
					$seller: seller,
					$listing: listing_signature,
					$quantity: quantity,
					$price: txmsg.price,
					$fee: txmsg.fee,
					$refund: refund,
					$status: SALE_STATUS_PENDING,
					$onchain: 1,
					$fulfillment_tx: '',
					$retry_count: 0,
					$last_attempt: 0,
					$block_id: chain.block_id,
					$block_hash: chain.block_hash,
					$transaction_id: chain.transaction_id,
					$created_at: now,
					$updated_at: now
				},
				this.dbname
			);
			console.log('Store: purchase queued', tx.signature);
		} catch (err) {
			if (String(err?.message || err).includes('UNIQUE')) {
				console.log('Store: purchase already queued', tx.signature);
				return;
			}
			console.warn('Store: purchase queue failed', err?.message);
			await this.refundBuyer(buyer, listing_signature, amount_paid, 'queue-failed');
		}
	},

	async processSales() {
		if (this.app.BROWSER) {
			return;
		}

		let rows = [];
		try {
			rows = await this.app.storage.queryDatabase(
				`SELECT * FROM sales WHERE status = $status AND onchain = $onchain ORDER BY id ASC`,
				{ $status: SALE_STATUS_PENDING, $onchain: 1 },
				this.dbname
			);
		} catch (err) {
			console.log('Store: processSales load failed', err?.message);
			return;
		}

		if (!rows?.length) {
			return;
		}

		for (const row of rows) {
			if (row.fulfillment_tx) {
				continue;
			}

			const listing_sig = row.listing;
			const buyer = row.buyer;
			const quantity = Number(row.quantity) || 1;
			const unit_price = BigInt(this.app.wallet.convertSaitoToNolan(row.price) ?? 0);
			const listing = await this.returnListing(listing_sig);
			const now = Date.now();

			let can_fulfill = true;
			if (!listing || !listing.isActive()) {
				can_fulfill = false;
			} else if (listing.returnQuantity() < quantity) {
				can_fulfill = false;
			} else if (unit_price < BigInt(this.app.wallet.convertSaitoToNolan(listing.price) ?? 0)) {
				can_fulfill = false;
			} else if (
				listing.access_script &&
				!(await storeCanSpendListingScript(this.app, this.store_public_key, listing.access_script))
			) {
				can_fulfill = false;
			}

			const nft_owned = can_fulfill ? await this.returnWalletListingNFT(listing) : null;
			if (can_fulfill && !nft_owned) {
				can_fulfill = false;
			}

			if (!can_fulfill) {
				const retry_count = Number(row.retry_count || 0) + 1;
				await this.app.storage.runDatabase(
					`UPDATE sales SET retry_count = $retry_count, last_attempt = $last_attempt, updated_at = $updated_at WHERE id = $id`,
					{
						$id: row.id,
						$retry_count: retry_count,
						$last_attempt: now,
						$updated_at: now
					},
					this.dbname
				);
				if (retry_count >= SALE_MAX_RETRIES) {
					await this.app.storage.runDatabase(
						`UPDATE sales SET status = $status, updated_at = $updated_at WHERE id = $id`,
						{ $id: row.id, $status: SALE_STATUS_FAILED, $updated_at: now },
						this.dbname
					);
				}
				continue;
			}

			const nft = new SaitoNFT(this.app, this, null, nft_owned);
			const nft_image = nft.returnImage?.() || '';
			if (nft_image) {
				this.image_cache[listing_sig] = nft_image;
			}

			let fulfillment_tx = null;

			try {
				if (quantity >= Number(nft_owned.amount || listing.quantity || 1)) {
					fulfillment_tx = await this.app.wallet.createNFTShardTransaction(nft, buyer);
				} else {
					fulfillment_tx = await this.app.wallet.createNFTTransaction(
						nft,
						buyer,
						quantity,
						BigInt(0),
						BigInt(0),
						nft.txmsg || {}
					);
				}
			} catch (err) {
				console.warn('Store: processSales fulfillment build failed', err?.message);
				const retry_count = Number(row.retry_count || 0) + 1;
				await this.app.storage.runDatabase(
					`UPDATE sales SET retry_count = $retry_count, last_attempt = $last_attempt, updated_at = $updated_at WHERE id = $id`,
					{
						$id: row.id,
						$retry_count: retry_count,
						$last_attempt: now,
						$updated_at: now
					},
					this.dbname
				);
				if (retry_count >= SALE_MAX_RETRIES) {
					await this.app.storage.runDatabase(
						`UPDATE sales SET status = $status, updated_at = $updated_at WHERE id = $id`,
						{ $id: row.id, $status: SALE_STATUS_FAILED, $updated_at: now },
						this.dbname
					);
				}
				continue;
			}

			if (!fulfillment_tx?.msg) {
				continue;
			}

			fulfillment_tx.msg = {
				...(fulfillment_tx.msg || {}),
				module: 'Store',
				request: 'fulfill-sale',
				sale_signature: row.signature,
				listing: listing_sig,
				buyer,
				quantity,
				price: row.price
			};

			await fulfillment_tx.sign();
			await this.insertTransaction(fulfillment_tx, { onchain: 1 });

			await this.app.storage.runDatabase(
				`UPDATE sales SET status = $status, fulfillment_tx = $fulfillment_tx, last_attempt = $last_attempt, updated_at = $updated_at WHERE id = $id`,
				{
					$id: row.id,
					$status: SALE_STATUS_FULFILLING,
					$fulfillment_tx: fulfillment_tx.signature,
					$last_attempt: now,
					$updated_at: now
				},
				this.dbname
			);

			console.log('Store: processSales propagating fulfillment', fulfillment_tx.signature);
			this.app.network.propagateTransaction(fulfillment_tx);
			break;
		}
	},

	async receiveFulfillmentTransaction(blk, tx) {
		if (this.app.BROWSER) {
			return;
		}

		const txmsg = tx.returnMessage?.() || {};
		if (txmsg.module !== 'Store' || txmsg.request !== 'fulfill-sale') {
			return;
		}

		const sale_signature = txmsg.sale_signature;
		const listing_sig = txmsg.listing;
		const buyer = txmsg.buyer;
		const quantity = Number(txmsg.quantity) || 1;

		if (!sale_signature || !listing_sig) {
			return;
		}

		const res = await this.app.storage.queryDatabase(
			`SELECT * FROM sales WHERE signature = $signature LIMIT 1`,
			{ $signature: sale_signature },
			this.dbname
		);
		const sale = res?.[0];
		if (!sale) {
			return;
		}

		if (Number(sale.status) === SALE_STATUS_FINALIZED) {
			return;
		}

		if (Number(sale.status) !== SALE_STATUS_FULFILLING) {
			return;
		}

		if (sale.fulfillment_tx && sale.fulfillment_tx !== tx.signature) {
			return;
		}

		const now = Date.now();
		await this.app.storage.runDatabase(
			`UPDATE sales SET status = $status, fulfillment_tx = $fulfillment_tx, updated_at = $updated_at WHERE id = $id`,
			{
				$id: sale.id,
				$status: SALE_STATUS_FINALIZED,
				$fulfillment_tx: tx.signature,
				$updated_at: now
			},
			this.dbname
		);

		const listing = await this.returnListing(listing_sig);
		if (listing) {
			const remaining = listing.returnQuantity() - quantity;
			if (remaining > 0) {
				await this.updateListingQuantity(listing_sig, remaining);
			} else {
				await this.updateListingStatus(listing_sig, LISTING_STATUS_SPENT);
				this.removeListing(listing_sig);
			}
		}

		const seller = sale.seller || listing?.seller;
		const unit_price = BigInt(this.app.wallet.convertSaitoToNolan(sale.price) ?? 0);
		const payout_nolan = unit_price * BigInt(quantity);
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
					listing_signature: listing_sig,
					sale_signature
				};
				await payout_tx.sign();
				this.app.network.propagateTransaction(payout_tx);
			} catch (err) {
				console.warn('Store: seller payout failed', err?.message);
			}
		}

		console.log('Store: sale finalized', sale_signature);
	},

	async refundBuyer(buyer, listing_sig, amount, reason) {
		if (!buyer || !listing_sig || amount <= 0n) {
			return;
		}

		console.warn('Store: refunding buyer', { buyer, listing_sig, reason });
		try {
			const refund_tx = await this.app.wallet.createUnsignedTransaction(buyer, amount, BigInt(0));
			refund_tx.msg = {
				module: 'Store',
				request: 'purchase_refund',
				reason,
				listing_signature: listing_sig
			};
			await refund_tx.sign();
			this.app.network.propagateTransaction(refund_tx);
		} catch (err) {
			console.warn('Store: refund failed', err?.message);
		}
	},

	async insertListing(listing) {
		await this.app.storage.runDatabase(
			`INSERT INTO listings (
			  signature, nft_id, seller, title, description, image,
			  price, quantity, status, onchain, block_id, block_hash, transaction_id, slip_id,
			  created_at, updated_at
			) VALUES (
			  $signature, $nft_id, $seller, $title, $description, $image,
			  $price, $quantity, $status, $onchain, $block_id, $block_hash, $transaction_id, $slip_id,
			  $created_at, $updated_at
			)`,
			{
				$signature: listing.signature,
				$nft_id: listing.nft_id,
				$seller: listing.seller,
				$title: listing.title,
				$description: listing.description,
				$image: listing.image,
				$price: String(listing.price ?? ''),
				$quantity: listing.quantity,
				$status: listing.status,
				$onchain: listing.onchain ?? 1,
				$block_id: listing.block_id ?? 0,
				$block_hash: listing.block_hash || '',
				$transaction_id: listing.transaction_id ?? 0,
				$slip_id: listing.slip_id ?? 0,
				$created_at: listing.created_at,
				$updated_at: listing.updated_at
			},
			this.dbname
		);
	},

	async insertTransaction(tx, metadata = {}) {
		if (!tx?.signature) {
			return;
		}

		const serialized = tx.serialize_to_web(this.app);
		await this.app.storage.runDatabase(
			`INSERT INTO transactions (signature, tx, onchain, block_id, block_hash, transaction_id, created_at)
			 VALUES ($signature, $tx, $onchain, $block_id, $block_hash, $transaction_id, $created_at)`,
			{
				$signature: tx.signature,
				$tx: JSON.stringify(serialized),
				$onchain: metadata.onchain ?? 1,
				$block_id: metadata.block_id ?? 0,
				$block_hash: metadata.block_hash || '',
				$transaction_id: metadata.transaction_id ?? 0,
				$created_at: Date.now()
			},
			this.dbname
		);
	},

	returnChainLocation(blk = null, tx = null) {
		return {
			block_id: Number(blk?.id ?? blk?.block_id ?? blk?.bid ?? 0) || 0,
			block_hash: String(blk?.hash ?? blk?.block_hash ?? blk?.bsh ?? ''),
			transaction_id: Number(tx?.transaction_id ?? tx?.tx_index ?? tx?.index ?? 0) || 0
		};
	},

	returnListingSlipId(tx = null, pay_descriptor = '') {
		const outputs = tx?.to || [];
		for (let i = 0; i < outputs.length; i++) {
			const slip = outputs[i];
			if (pay_descriptor && slip?.publicKey === pay_descriptor) {
				return Number(slip?.index ?? slip?.slip_id ?? i) || 0;
			}
		}
		return 0;
	},

	returnAmountPaidToStore(tx) {
		let amount_paid = 0n;

		for (const o of tx.to || []) {
			if (o?.publicKey === this.publicKey) {
				const a = typeof o.amount === 'bigint' ? o.amount : BigInt(o.amount ?? 0);
				amount_paid += a;
			}
		}

		if (tx.isFrom(this.publicKey) && tx.to?.[0]) {
			const a =
				typeof tx.to[0].amount === 'bigint' ? tx.to[0].amount : BigInt(tx.to[0].amount ?? 0);
			amount_paid = a;
		}

		return amount_paid;
	},

	async returnWalletListingNFT(listing = {}) {
		const nft_id = listing.nft_id;
		const signature = listing.signature;
		if (!nft_id || !signature) {
			return null;
		}

		let raw = await this.app.wallet.getNFTList();
		const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
		return (list || []).find((n) => n.id === nft_id && n?.tx_sig === signature) || null;
	},

	async returnListing(signature) {
		if (this.listings[signature]) {
			return this.listings[signature];
		}

		try {
			const res = await this.app.storage.queryDatabase(
				`SELECT * FROM listings WHERE signature = $signature LIMIT 1`,
				{ $signature: signature },
				this.dbname
			);
			if (!res?.length) {
				return null;
			}

			const listing = new Listing(this.app, this, res[0]);
			this.addListing(listing);
			return listing;
		} catch (err) {
			return null;
		}
	},

	async updateListingStatus(signature, status) {
		const now = Date.now();
		await this.app.storage.runDatabase(
			`UPDATE listings SET status = $status, updated_at = $updated_at WHERE signature = $signature`,
			{ $signature: signature, $status: status, $updated_at: now },
			this.dbname
		);

		if (this.listings[signature]) {
			this.listings[signature].status = status;
			this.listings[signature].updated_at = now;
		}
	},

	async updateListingQuantity(signature, quantity) {
		const now = Date.now();
		await this.app.storage.runDatabase(
			`UPDATE listings SET quantity = $quantity, updated_at = $updated_at WHERE signature = $signature`,
			{ $signature: signature, $quantity: quantity, $updated_at: now },
			this.dbname
		);

		if (this.listings[signature]) {
			this.listings[signature].quantity = quantity;
			this.listings[signature].updated_at = now;
		}
	}

};
