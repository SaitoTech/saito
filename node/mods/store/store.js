const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const PeerService = require('saito-js/lib/peer_service').default;
const Main = require('./lib/ui/main');
const ProductOverlay = require('./lib/ui/overlays/product');
const ListingOverlay = require('./lib/ui/overlays/listing');
const SaitoNFT = require('../../lib/saito/ui/saito-nft/saito-nft');
const { generateListingScript, storeCanSpendListingScript } = require('./lib/listing-script');
const { hydrateListingFromArchive } = require('./lib/listing-hydration');
const index = require('./index');


class Store extends ModTemplate {

	constructor(app) {
		super(app);

		this.name = 'Store';
		this.slug = 'store';
		this.dbname = 'store';

		this.main = null;
		this.header = null;
		this.product_overlay = null;
		this.listing_overlay = null;
		this.listings = [];
		this.store_public_key = '';
		this.store_peer_index = null;
		this.fee = 0;
	}

	async initialize(app) {

		await super.initialize(app);

		if (!this.app.BROWSER) {
			this.store_public_key = this.publicKey;
			await this.ensureListingsSchema();
			await this.restoreListingsFromDB();
			console.log('Store: initialize (node) store_public_key=', this.store_public_key);
		} else {
			//
			// this.store_public_key set in onPeerServiceUp();
			//
		}

		if (this.browser_active) {
			this.main = new Main(this.app, this);
			this.header = new SaitoHeader(this.app, this);
			this.product_overlay = new ProductOverlay(this.app, this);
			this.listing_overlay = new ListingOverlay(this.app, this);
		}

		if (this.browser_active) {
			this.app.connection.on('store-listing-hydrated', (listing) => {
				this.onListingHydrated(listing);
			});
		}
	}

	returnServices() {
		let services = [];
		if (!this.app.BROWSER) {
			services.push(new PeerService(null, 'Store', this.publicKey));
		}
		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		if (service.service === 'Store') {
			this.store_public_key = peer.publicKey;
			this.store_peer_index = peer.peerIndex;
			console.log('Store: onPeerServiceUp store_public_key=', this.store_public_key);

			if (this.browser_active) {
				this.loadListings(peer);
			}
		}
	}

	loadListings(peer = null) {
		if (!this.app.BROWSER || !this.browser_active) {
			return;
		}

		const peer_key = peer?.publicKey || this.store_public_key;
		if (!peer_key) {
			return;
		}

		this.app.network.sendRequestAsTransaction(
			'load-listings',
			{ module: 'Store' },
			(response) => {
				console.log('Store: loadListings response', response);
				if (response?.listings) {
					this.listings = response.listings;
					this.app.connection.emit('store-render-listings');
					this.hydrateListingImages();
				}
			},
			peer_key
		);
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
		if (tx == null) {
			return 0;
		}

		let txmsg = tx.returnMessage();

		if (txmsg?.request === 'load-listings') {
			if (!this.app.BROWSER && mycallback != null) {
				mycallback({ listings: this.listings });
				return 1;
			}
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	hydrateListingImages() {
		if (!this.app.BROWSER) {
			return;
		}

		for (const listing of this.listings) {
			if (listing.image != null) {
				continue;
			}
			hydrateListingFromArchive(this.app, this, listing, (updated) => {
				if (updated?.image != null) {
					this.app.connection.emit('store-listing-hydrated', updated);
				}
			});
		}
	}

	onListingHydrated(listing = {}) {
		const listing_key = listing.nfttx_sig || listing.tx_sig || listing.id;
		if (!listing_key) {
			return;
		}

		const card = document.querySelector(`#store-teaser-${listing_key} .teaser-media`);
		if (card && listing.image) {
			card.classList.remove('gradient-1', 'gradient-2', 'gradient-3', 'gradient-4', 'gradient-5');
			card.classList.add('has-image');
			card.style.background = `url(${listing.image}) center / cover no-repeat`;
		}

		const open = this.product_overlay?.product;
		const open_key = open?.nfttx_sig || open?.tx_sig || open?.id;
		if (open_key && open_key === listing_key) {
			this.product_overlay.render(listing);
		}
	}

	async render() {

		if (!this.main) {
			return;
		}

		await this.main.render();
		await this.header.render();
	}

	async onConfirmation(blk, tx, conf = 0) {

		let txmsg = tx.returnMessage();
		let store_self = this.app.modules.returnModule('Store');

		if (Number(conf) === 0) {
			if (txmsg.module === 'Store' && txmsg.request === 'list-asset') {
				console.log('Store: onConfirmation list-asset conf=0', tx.signature);
				await store_self.receiveListAssetTransaction(blk, tx);
			}

			if (txmsg.module === 'Store' && txmsg.request === 'purchase-asset') {
				console.log('Store: onConfirmation purchase-asset conf=0', tx.signature);
				await store_self.receivePurchaseAssetTransaction(blk, tx);
			}
		}

	}

	async onNewBlock(blk, lc) {
		if (!this.app.BROWSER) {
			await this.processPendingPurchases();
		}
	}

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
			const reserve_price = listing_meta.price;
			const access_hash = txmsg.access_hash;
			const access_script = txmsg.access_script;
			const pay_descriptor = listing_meta.pay_descriptor;
			const created_at = listing_meta.listing_timestamp;
			const tx_sig = tx.signature;

			console.log('Store: receiveListAssetTransaction extracted', {
				tx_sig,
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
					tx_sig
				});
				return;
			}

			console.log('Store: receiveListAssetTransaction accepted for inventory', tx_sig);

			const record = {
				tx_sig,
				nfttx_sig: tx_sig,
				nft_id,
				seller,
				title,
				description,
				price,
				denomination,
				quantity,
				reserve_price,
				access_hash,
				access_script,
				pay_descriptor,
				created_at,
				status: 1,
				image: null
			};

			this.listings.push(record);

			const sql = `
			  INSERT INTO listings (nfttx_sig, nft_id, seller, title, description, image, reserve_price, quantity, status, created_at)
			  VALUES ($nfttx_sig, $nft_id, $seller, $title, $description, $image, $reserve_price, $quantity, $status, $created_at)
			`;
			await this.app.storage.runDatabase(
				sql,
				{
					$nfttx_sig: record.nfttx_sig,
					$nft_id: record.nft_id,
					$seller: record.seller,
					$title: record.title,
					$description: record.description,
					$image: record.image,
					$reserve_price: record.reserve_price,
					$quantity: record.quantity,
					$status: record.status,
					$created_at: record.created_at
				},
				this.dbname
			);

			console.log('Store: receiveListAssetTransaction persisted', record.nfttx_sig);
		} catch (err) {
			console.log('Store: receiveListAssetTransaction ignored (extract/persist failed)', err?.message);
			return;
		}
	}

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

		// Clone NFT txmsg unchanged; add Store protocol fields at top level and listing
		// metadata under txmsg.listing (never overwrite NFT title/description/data).
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
	}

	async createPurchaseAssetTransaction(listing, price_breakdown, nolan_to_send = 0n, quantity = 1) {
		const { price, fee } = price_breakdown;
		const buyer = await this.app.wallet.getPublicKey();
		const to_address = this.store_public_key;

		if (!to_address) {
			throw new Error('Store public key is not configured');
		}

		const listing_signature = listing?.nfttx_sig || listing?.tx_sig || listing?.id;
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
	}

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
	}

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

		try {
			await this.queuePurchaseRequest({
				purchase_sig: tx.signature,
				buyer,
				seller,
				listing_signature,
				nft_id: listing?.nft_id || '',
				quantity,
				price: txmsg.price,
				fee: txmsg.fee,
				refund,
				created_at: Date.now()
			});
			console.log('Store: purchase queued', tx.signature);
		} catch (err) {
			if (String(err?.message || err).includes('UNIQUE')) {
				console.log('Store: purchase already queued', tx.signature);
				return;
			}
			console.warn('Store: purchase queue failed', err?.message);
			await this.refundBuyer(buyer, listing_signature, amount_paid, 'queue-failed');
		}
	}

	async queuePurchaseRequest(record = {}) {
		const sql = `
		  INSERT INTO sales (
		    purchase_sig, buyer, seller, listing_signature, nft_id, quantity,
		    price, fee, refund, status, created_at
		  )
		  VALUES (
		    $purchase_sig, $buyer, $seller, $listing_signature, $nft_id, $quantity,
		    $price, $fee, $refund, $status, $created_at
		  )
		`;

		await this.app.storage.runDatabase(
			sql,
			{
				$purchase_sig: record.purchase_sig,
				$buyer: record.buyer,
				$seller: record.seller,
				$listing_signature: record.listing_signature,
				$nft_id: record.nft_id,
				$quantity: record.quantity,
				$price: record.price,
				$fee: record.fee,
				$refund: record.refund,
				$status: 'pending',
				$created_at: record.created_at
			},
			this.dbname
		);
	}

	async processPendingPurchases() {
		if (this.app.BROWSER) {
			return;
		}

		let rows = [];
		try {
			rows = await this.app.storage.queryDatabase(
				`SELECT * FROM sales WHERE status = 'pending' ORDER BY id ASC`,
				{},
				this.dbname
			);
		} catch (err) {
			console.log('Store: processPendingPurchases load failed', err?.message);
			return;
		}

		if (!rows?.length) {
			return;
		}

		for (const row of rows) {
			await this.settleQueuedPurchase(row);
		}
	}

	async settleQueuedPurchase(row) {
		const buyer = row.buyer;
		const listing_signature = row.listing_signature;
		const quantity = Number(row.quantity) || 1;
		const unit_price = BigInt(this.app.wallet.convertSaitoToNolan(row.price) ?? 0);
		const fee = BigInt(this.app.wallet.convertSaitoToNolan(row.fee) ?? 0);
		const total_paid = unit_price * BigInt(quantity) + fee;

		const purchase_tx = await this.loadTransactionBySig(row.purchase_sig);
		const amount_paid = purchase_tx
			? this.returnAmountPaidToStore(purchase_tx)
			: total_paid;

		const listing = await this.returnListing(listing_signature);

		if (!listing || Number(listing.status) !== 1) {
			console.warn('Store: settlement listing not active', listing_signature);
			await this.refundBuyer(buyer, listing_signature, amount_paid, 'listing-not-active');
			await this.updatePurchaseQueueStatus(row.id, 'failed');
			return;
		}

		if (Number(listing.quantity) < quantity) {
			console.warn('Store: settlement insufficient quantity', listing_signature);
			await this.refundBuyer(buyer, listing_signature, amount_paid, 'insufficient-quantity');
			await this.updatePurchaseQueueStatus(row.id, 'failed');
			return;
		}

		const reserve = BigInt(this.app.wallet.convertSaitoToNolan(listing.reserve_price ?? listing.price) ?? 0);
		if (unit_price < reserve) {
			console.warn('Store: settlement below reserve', listing_signature);
			await this.refundBuyer(buyer, listing_signature, amount_paid, 'below-reserve');
			await this.updatePurchaseQueueStatus(row.id, 'failed');
			return;
		}

		if (listing.access_script) {
			const can_spend = await storeCanSpendListingScript(
				this.app,
				this.store_public_key,
				listing.access_script
			);
			if (!can_spend) {
				console.warn('Store: settlement store cannot spend listing script', listing_signature);
				await this.refundBuyer(buyer, listing_signature, amount_paid, 'store-cannot-spend');
				await this.updatePurchaseQueueStatus(row.id, 'failed');
				return;
			}
		}

		const nft_owned = await this.returnWalletListingNFT(listing);
		if (!nft_owned) {
			console.warn('Store: settlement NFT not held', listing_signature);
			await this.refundBuyer(buyer, listing_signature, amount_paid, 'nft-not-held');
			await this.updatePurchaseQueueStatus(row.id, 'failed');
			return;
		}

		const nft = new SaitoNFT(this.app, this, null, nft_owned);

		let nft_tx = null;
		try {
			if (quantity >= Number(nft_owned.amount || listing.quantity || 1)) {
				nft_tx = await this.app.wallet.createNFTShardTransaction(nft, buyer);
			} else {
				nft_tx = await this.app.wallet.createNFTTransaction(
					nft,
					buyer,
					quantity,
					BigInt(0),
					BigInt(0),
					nft.txmsg || {}
				);
			}
		} catch (err) {
			console.warn('Store: settlement NFT transfer build failed', err?.message);
			await this.refundBuyer(buyer, listing_signature, amount_paid, 'fulfillment-not-possible');
			await this.updatePurchaseQueueStatus(row.id, 'failed');
			return;
		}

		if (!nft_tx?.msg) {
			await this.refundBuyer(buyer, listing_signature, amount_paid, 'fulfillment-not-possible');
			await this.updatePurchaseQueueStatus(row.id, 'failed');
			return;
		}

		console.log('Store: settlement issuing NFT', row.purchase_sig);
		await nft_tx.sign();
		this.app.network.propagateTransaction(nft_tx);

		const remaining = Number(listing.quantity) - quantity;
		if (remaining > 0) {
			await this.updateListingQuantity(listing_signature, remaining);
		} else {
			await this.updateListingStatus(listing_signature, 2);
			this.removeListingFromMemory(listing_signature);
		}

		const seller = listing.seller || row.seller;
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
					listing_signature
				};
				await payout_tx.sign();
				this.app.network.propagateTransaction(payout_tx);
			} catch (err) {
				console.warn('Store: seller payout failed', err?.message);
			}
		}

		await this.updatePurchaseQueueStatus(row.id, 'completed');
		await this.restoreListingsFromDB();
	}

	async loadTransactionBySig(sig) {
		if (!sig) {
			return null;
		}

		return new Promise((resolve) => {
			this.app.storage.loadTransactions({ sig }, (txs) => {
				resolve(txs?.[0] || null);
			}, 'localhost');
		});
	}

	async returnWalletListingNFT(listing = {}) {
		const nft_id = listing.nft_id;
		const nfttx_sig = listing.nfttx_sig || listing.tx_sig || listing.listing_signature;
		if (!nft_id || !nfttx_sig) {
			return null;
		}

		let raw = await this.app.wallet.getNFTList();
		const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
		return (list || []).find((n) => n.id === nft_id && n?.tx_sig === nfttx_sig) || null;
	}

	async returnListing(listing_signature) {
		for (const listing of this.listings) {
			if (listing.nfttx_sig === listing_signature || listing.tx_sig === listing_signature) {
				return listing;
			}
		}

		try {
			const sql = `SELECT * FROM listings WHERE nfttx_sig = $nfttx_sig LIMIT 1`;
			const res = await this.app.storage.queryDatabase(
				sql,
				{ $nfttx_sig: listing_signature },
				this.dbname
			);
			if (!res?.length) {
				return null;
			}

			const row = res[0];
			return {
				id: row.nfttx_sig,
				tx_sig: row.nfttx_sig,
				nfttx_sig: row.nfttx_sig,
				nft_id: row.nft_id,
				seller: row.seller,
				title: row.title,
				description: row.description,
				price: row.reserve_price,
				reserve_price: row.reserve_price,
				quantity: row.quantity,
				status: row.status,
				created_at: row.created_at
			};
		} catch (err) {
			return null;
		}
	}

	async updatePurchaseQueueStatus(id, status) {
		await this.app.storage.runDatabase(
			`UPDATE sales SET status = $status WHERE id = $id`,
			{ $id: id, $status: status },
			this.dbname
		);
	}

	async updateListingStatus(listing_signature, status) {
		await this.app.storage.runDatabase(
			`UPDATE listings SET status = $status WHERE nfttx_sig = $nfttx_sig`,
			{ $nfttx_sig: listing_signature, $status: status },
			this.dbname
		);

		for (const listing of this.listings) {
			if (listing.nfttx_sig === listing_signature || listing.tx_sig === listing_signature) {
				listing.status = status;
			}
		}
	}

	async updateListingQuantity(listing_signature, quantity) {
		await this.app.storage.runDatabase(
			`UPDATE listings SET quantity = $quantity WHERE nfttx_sig = $nfttx_sig`,
			{ $nfttx_sig: listing_signature, $quantity: quantity },
			this.dbname
		);

		for (const listing of this.listings) {
			if (listing.nfttx_sig === listing_signature || listing.tx_sig === listing_signature) {
				listing.quantity = quantity;
			}
		}
	}

	removeListingFromMemory(listing_signature) {
		this.listings = this.listings.filter(
			(l) => l.nfttx_sig !== listing_signature && l.tx_sig !== listing_signature
		);
	}

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
	}

	async ensureListingsSchema() {
		if (this.app.BROWSER) {
			return;
		}

		try {
			await this.app.storage.runDatabase(
				`ALTER TABLE listings ADD COLUMN image TEXT DEFAULT NULL`,
				{},
				this.dbname
			);
		} catch (err) {
			// column already exists
		}
	}

	async restoreListingsFromDB() {
		if (this.app.BROWSER) {
			return;
		}

		try {
			const sql = `SELECT * FROM listings WHERE status = 1`;
			const res = await this.app.storage.queryDatabase(sql, {}, this.dbname);
			if (!res?.length) {
				return;
			}

			this.listings = res.map((row) => ({
				id: row.nfttx_sig,
				tx_sig: row.nfttx_sig,
				nfttx_sig: row.nfttx_sig,
				nft_id: row.nft_id,
				seller: row.seller,
				title: row.title,
				description: row.description,
				image: row.image ?? null,
				price: row.reserve_price,
				reserve_price: row.reserve_price,
				quantity: row.quantity,
				created_at: row.created_at,
				status: row.status
			}));
		} catch (err) {
			console.log('Store: restoreListingsFromDB failed', err?.message);
		}
	}

	getItemsForSale() {
		if (this.listings.length > 0) {
			return this.listings.map((listing) => ({
				...listing,
				id: listing.id || listing.nfttx_sig || listing.tx_sig
			}));
		}

		return [
			{
				id: 1,
				title: '3 SAITO',
				subtitle: 'Archival Series',
				price: '3 SAITO',
				seller: 'anon-szuhff',
				image: 'gradient-1',
				badge: true
			},
			{
				id: 2,
				title: '5 SAITO',
				subtitle: 'Genesis Drop',
				price: '5 SAITO',
				seller: 'anon-kx9pld',
				image: 'gradient-2',
				badge: false
			},
			{
				id: 3,
				title: '8 SAITO',
				subtitle: 'Creator Bundle',
				price: '8 SAITO',
				seller: 'anon-vq2mtn',
				image: 'gradient-3',
				badge: true
			},
			{
				id: 4,
				title: '12 SAITO',
				subtitle: 'Community Special',
				price: '12 SAITO',
				seller: 'anon-hf7rqp',
				image: 'gradient-4',
				badge: false
			},
			{
				id: 5,
				title: '15 SAITO',
				subtitle: 'Founders Capsule',
				price: '15 SAITO',
				seller: 'anon-ly3gca',
				image: 'gradient-5',
				badge: true
			},
			{
				id: 6,
				title: '20 SAITO',
				subtitle: 'Limited Vault',
				price: '20 SAITO',
				seller: 'anon-nr8wse',
				image: 'gradient-6',
				badge: false
			},
			{
				id: 7,
				title: '25 SAITO',
				subtitle: 'Verified Set',
				price: '25 SAITO',
				seller: 'anon-bm4qzt',
				image: 'gradient-7',
				badge: true
			},
			{
				id: 8,
				title: '30 SAITO',
				subtitle: 'Collector Tier',
				price: '30 SAITO',
				seller: 'anon-pd1yuk',
				image: 'gradient-8',
				badge: false
			},
			{
				id: 9,
				title: '40 SAITO',
				subtitle: 'Premium Relay',
				price: '40 SAITO',
				seller: 'anon-tj6xev',
				image: 'gradient-9',
				badge: true
			},
			{
				id: 10,
				title: '55 SAITO',
				subtitle: 'Legendary Pack',
				price: '55 SAITO',
				seller: 'anon-qw5nfr',
				image: 'gradient-10',
				badge: false
			}
		];
	}

	webServer(app, expressapp, express, alternative_slug = null) {
		const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
		const self = this;

		expressapp.use(uri, express.static(webdir));

		expressapp.get(uri, async function (req, res) {
			const html = index(app, self, app.build_number);
			res.setHeader('Content-type', 'text/html');
			res.charset = 'UTF-8';
			return res.send(html);
		});
	}
}

module.exports = Store;
