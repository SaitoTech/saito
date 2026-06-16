const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const PeerService = require('saito-js/lib/peer_service').default;
const SaitoNFT = require('../../lib/saito/ui/saito-nft/saito-nft');
const Main = require('./lib/ui/main');
const ProductOverlay = require('./lib/ui/overlays/product');
const ListingOverlay = require('./lib/ui/overlays/listing');
const PurchaseFlow = require('./lib/ui/overlays/purchase');
const Listing = require('./lib/listing');
const transactions = require('./lib/transactions');
const Transaction = require('../../lib/saito/transaction').default;
const index = require('./index');

const LISTING_STATUS_ACTIVE = 1;
const INITIAL_LISTING_LIMIT = 20;

const ALLOWED_IMAGE_MIMES = new Set([
	'image/png',
	'image/jpeg',
	'image/svg+xml',
	'image/gif',
	'image/webp'
]);

function decodeImageDataURI(data_uri = '') {
	if (!data_uri || typeof data_uri !== 'string' || !data_uri.startsWith('data:image/')) {
		return null;
	}

	const comma = data_uri.indexOf(',');
	if (comma === -1) {
		return null;
	}

	const header = data_uri.slice(0, comma);
	const payload = data_uri.slice(comma + 1);
	const mime_match = header.match(/^data:(image\/[^;]+)/i);
	if (!mime_match) {
		return null;
	}

	let mime = mime_match[1].toLowerCase();
	if (mime === 'image/jpg') {
		mime = 'image/jpeg';
	}
	if (!ALLOWED_IMAGE_MIMES.has(mime)) {
		return null;
	}

	let bytes = null;
	if (header.includes(';base64')) {
		bytes = Buffer.from(payload, 'base64');
	} else {
		bytes = Buffer.from(decodeURIComponent(payload), 'utf8');
	}

	if (!bytes?.length) {
		return null;
	}

	return { mime, bytes };
}


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
		this.purchase_flow = null;
		this.listings = {};
		this.image_cache = {};
		this.store_public_key = '';
		this.store_peer_index = null;
		this.fee = 0;

		Object.assign(this, transactions);
	}

	async initialize(app) {

		await super.initialize(app);

		if (!this.app.BROWSER) {
			this.store_public_key = this.publicKey;
			await this.initializeListings();
			await this.initializeImageCache();
		}

		if (this.browser_active) {
			this.main = new Main(this.app, this);
			this.header = new SaitoHeader(this.app, this);
			this.product_overlay = new ProductOverlay(this.app, this);
			this.listing_overlay = new ListingOverlay(this.app, this);
			this.purchase_flow = new PurchaseFlow(this.app, this);
		}
	}

	async initializeListings() {
		if (this.app.BROWSER) {
			return;
		}

		this.listings = {};

		let rows = [];
		try {
			rows = await this.app.storage.queryDatabase(
				`SELECT * FROM listings
				 WHERE status = $status AND onchain = $onchain
				 ORDER BY created_at DESC
				 LIMIT $limit`,
				{
					$status: LISTING_STATUS_ACTIVE,
					$onchain: 1,
					$limit: INITIAL_LISTING_LIMIT
				},
				this.dbname
			);
		} catch (err) {
			console.log('Store: initializeListings failed', err?.message);
			return;
		}

		if (!rows?.length) {
			return;
		}

		for (const row of rows) {
			this.addListing(row);
		}
	}

	async initializeImageCache() {
		if (this.app.BROWSER) {
			return;
		}

		for (const listing of Object.values(this.listings)) {
			if (!listing?.signature || this.image_cache[listing.signature]) {
				continue;
			}

			try {
				const res = await this.app.storage.queryDatabase(
					`SELECT tx FROM transactions WHERE signature = $signature AND onchain = $onchain LIMIT 1`,
					{ $signature: listing.signature, $onchain: 1 },
					this.dbname
				);
				if (!res?.length || !res[0]?.tx) {
					continue;
				}

				let raw = res[0].tx;
				if (typeof raw === 'string') {
					raw = JSON.parse(raw);
				}

				const tx = new Transaction();
				tx.deserialize_from_web(this.app, raw);

				const nft = new SaitoNFT(this.app, this, tx, null);
				const image = nft.returnImage?.() || '';
				if (image) {
					this.image_cache[listing.signature] = image;
				}
			} catch (err) {
				continue;
			}
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
		if (service.service !== 'Store') {
			return;
		}

		if (this.store_public_key) {
			return;
		}

		this.store_public_key = peer.publicKey;
		this.store_peer_index = peer.peerIndex;
		console.log('Store: onPeerServiceUp store_public_key=', this.store_public_key);

		if (!this.browser_active) {
			return;
		}

		this.app.network.sendRequestAsTransaction(
			'load-listings',
			{ module: 'Store' },
			(response) => {
				console.log('Store: loadListings response', response);
				if (response?.listings) {
					for (const data of response.listings) {
						this.addListing(data);
					}
					this.app.connection.emit('store-render-listings');
				}
			},
			peer.publicKey
		);
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
		if (tx == null) {
			return 0;
		}

		let txmsg = tx.returnMessage();

		if (txmsg?.request === 'load-listings') {
			if (!this.app.BROWSER && mycallback != null) {
				mycallback({
					listings: Object.values(this.listings)
						.filter((listing) => listing.isActive())
						.map((listing) => listing.serialize())
				});
				return 1;
			}
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	async render() {
		if (this.main) {
			await this.main.render();
			await this.header.render();
		}
	}

	async onConfirmation(blk, tx, conf = 0) {
		if (Number(conf) !== 0) {
			return;
		}

		const txmsg = tx.returnMessage();
		if (txmsg.module !== 'Store') {
			return;
		}

		if (this.app.BROWSER) {
			this.purchase_flow?.handleConfirmation(blk, tx, conf);
			return;
		}

		switch (txmsg.request) {
			case 'list-asset':
				console.log('Store: onConfirmation list-asset conf=0', tx.signature);
				await this.receiveListAssetTransaction(blk, tx);
				break;

			case 'purchase-asset':
				console.log('Store: onConfirmation purchase-asset conf=0', tx.signature);
				await this.receivePurchaseAssetTransaction(blk, tx);
				break;

			case 'fulfill-sale':
				console.log('Store: onConfirmation fulfill-sale conf=0', tx.signature);
				await this.receiveFulfillmentTransaction(blk, tx);
				break;
		}
	}

	async onNewBlock(blk, lc) {
		if (this.app.BROWSER) {
			this.purchase_flow?.checkBlockForPendingTx(blk);
			return;
		}

		await this.processSales();
	}

	async onChainReorganization(block_id, block_hash, lc) {
		if (this.app.BROWSER) {
			return;
		}

		const onchain = lc ? 1 : 0;
		const params = {
			$block_id: Number(block_id) || 0,
			$block_hash: String(block_hash || ''),
			$onchain: onchain
		};

		await this.app.storage.runDatabase(
			`UPDATE listings SET onchain = $onchain WHERE block_id = $block_id AND block_hash = $block_hash`,
			params,
			this.dbname
		);
		await this.app.storage.runDatabase(
			`UPDATE sales SET onchain = $onchain WHERE block_id = $block_id AND block_hash = $block_hash`,
			params,
			this.dbname
		);
		await this.app.storage.runDatabase(
			`UPDATE transactions SET onchain = $onchain WHERE block_id = $block_id AND block_hash = $block_hash`,
			params,
			this.dbname
		);

		for (const listing of Object.values(this.listings)) {
			if (
				Number(listing.block_id) === params.$block_id &&
				String(listing.block_hash || '') === params.$block_hash
			) {
				listing.onchain = onchain;
			}
		}
	}


	addListing(data) {
		const listing = data instanceof Listing ? data : new Listing(this.app, this, data);
		if (!listing.signature) {
			return null;
		}

		this.listings[listing.signature] = listing;
		return listing;
	}

	removeListing(signature) {
		delete this.listings[signature];
	}

	getItemsForSale() {
		const listings = Object.values(this.listings).filter((listing) => listing.isActive());
		if (listings.length > 0) {
			return listings;
		}

		const demo_data = [
			{
				signature: 'store-demo-1',
				title: '3 SAITO',
				subtitle: 'Archival Series',
				price: '3 SAITO',
				seller: 'anon-szuhff',
				image: 'gradient-1',
				badge: true
			},
			{
				signature: 'store-demo-2',
				title: '5 SAITO',
				subtitle: 'Genesis Drop',
				price: '5 SAITO',
				seller: 'anon-kx9pld',
				image: 'gradient-2',
				badge: false
			},
			{
				signature: 'store-demo-3',
				title: '8 SAITO',
				subtitle: 'Creator Bundle',
				price: '8 SAITO',
				seller: 'anon-vq2mtn',
				image: 'gradient-3',
				badge: true
			},
			{
				signature: 'store-demo-4',
				title: '12 SAITO',
				subtitle: 'Community Special',
				price: '12 SAITO',
				seller: 'anon-hf7rqp',
				image: 'gradient-4',
				badge: false
			},
			{
				signature: 'store-demo-5',
				title: '15 SAITO',
				subtitle: 'Founders Capsule',
				price: '15 SAITO',
				seller: 'anon-ly3gca',
				image: 'gradient-5',
				badge: true
			},
			{
				signature: 'store-demo-6',
				title: '20 SAITO',
				subtitle: 'Limited Vault',
				price: '20 SAITO',
				seller: 'anon-nr8wse',
				image: 'gradient-6',
				badge: false
			},
			{
				signature: 'store-demo-7',
				title: '25 SAITO',
				subtitle: 'Verified Set',
				price: '25 SAITO',
				seller: 'anon-bm4qzt',
				image: 'gradient-7',
				badge: true
			},
			{
				signature: 'store-demo-8',
				title: '30 SAITO',
				subtitle: 'Collector Tier',
				price: '30 SAITO',
				seller: 'anon-pd1yuk',
				image: 'gradient-8',
				badge: false
			},
			{
				signature: 'store-demo-9',
				title: '40 SAITO',
				subtitle: 'Premium Relay',
				price: '40 SAITO',
				seller: 'anon-tj6xev',
				image: 'gradient-9',
				badge: true
			},
			{
				signature: 'store-demo-10',
				title: '55 SAITO',
				subtitle: 'Legendary Pack',
				price: '55 SAITO',
				seller: 'anon-qw5nfr',
				image: 'gradient-10',
				badge: false
			}
		];

		return demo_data.map((data) => new Listing(this.app, this, data));
	}

	webServer(app, expressapp, express, alternative_slug = null) {
		const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
		const self = this;

		expressapp.get(`${uri}/cache/:listing_signature.img`, function (req, res) {
			const listing_signature = String(req.params.listing_signature || '');
			if (!listing_signature) {
				return res.status(404).end();
			}
			return self.returnCachedImageResponse(res, listing_signature);
		});

		expressapp.use(uri, express.static(webdir));

		expressapp.get(uri, async function (req, res) {
			const html = index(app, self, app.build_number);
			res.setHeader('Content-type', 'text/html');
			res.charset = 'UTF-8';
			return res.send(html);
		});
	}

	returnCachedImageResponse(res, listing_signature) {
		const image_data = this.image_cache[listing_signature];
		if (!image_data) {
			res.status(404).end();
			return;
		}

		const parsed = decodeImageDataURI(image_data);
		if (!parsed) {
			res.status(404).end();
			return;
		}

		res.writeHead(200, {
			'Content-Type': parsed.mime,
			'Content-Length': parsed.bytes.length
		});
		res.end(parsed.bytes);
	}
}

module.exports = Store;
