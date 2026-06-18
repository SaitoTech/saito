const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const PeerService = require('saito-js/lib/peer_service').default;
const Main = require('./lib/ui/main');
const Warehouse = require('./lib/warehouse');
const transactions = require('./lib/transactions');
const { serveCachedImageResponse } = require('./lib/images');
const { syncListingCache } = require('./lib/ui/listing-cache');
const index = require('./index');

class Store extends ModTemplate {

	constructor(app) {
		super(app);

		this.name = 'Store';
		this.slug = 'store';
		this.dbname = 'store';

		this.main = null;
		this.header = null;
		this.listings = {};
		this.image_cache = {};
		this.store_public_key = '';
		this.store_peer_index = null;
		this.fee = 0;

		this.warehouse = new Warehouse(app, this);
		Object.assign(this, transactions);
	}

	async initialize(app) {

		await super.initialize(app);

		if (!this.app.BROWSER) {
			this.store_public_key = this.publicKey;
			await this.warehouse.initialize();
		}

		if (this.browser_active) {
			this.main = new Main(this.app, this);
			await this.main.initialize();
			this.header = new SaitoHeader(this.app, this);
			await this.header.initialize(this.app);
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
						syncListingCache(this, data);
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
					listings: this.warehouse
						.returnActiveListings()
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

		switch (txmsg.request) {
			case 'list-asset':
				this.app.connection.emit('store-list-asset', { blk, tx, conf });
				console.log('Store: onConfirmation list-asset conf=0', tx.signature);
				await this.receiveListAssetTransaction(blk, tx);
				break;

			case 'purchase-asset':
				this.app.connection.emit('store-purchase-asset', { blk, tx, conf });
				console.log('Store: onConfirmation purchase-asset conf=0', tx.signature);
				await this.receivePurchaseAssetTransaction(blk, tx);
				break;
		}
	}

	async onNewBlock(blk, lc) {
		if (this.app.BROWSER) {
			this.app.connection.emit('store-new-block', { blk, lc });
			return;
		}

		await this.warehouse.onNewBlock(blk, lc);
	}

	async onChainReorganization(block_id, block_hash, lc) {
		if (this.app.BROWSER) {
			return;
		}

		await this.warehouse.onChainReorganization(block_id, block_hash, lc);
	}

	webServer(app, expressapp, express, alternative_slug = null) {
		const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
		const self = this;

		expressapp.get(`${uri}/cache/:listing_id.img`, function (req, res) {
			const listing_id = String(req.params.listing_id || '');
			if (!listing_id) {
				return res.status(404).end();
			}
			return serveCachedImageResponse(self, res, listing_id);
		});

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
