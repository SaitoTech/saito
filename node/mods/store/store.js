const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const PeerService = require('saito-js/lib/peer_service').default;
const Main = require('./lib/ui/main');
const Warehouse = require('./lib/warehouse');
const transactions = require('./lib/transactions');
const { serveCachedImageResponse } = require('./lib/images');
const { syncSummaryCache } = require('./lib/ui/summary-cache');
const index = require('./index');

class Store extends ModTemplate {

	constructor(app) {
		super(app);

		this.name = 'Store';
		this.slug = 'store';
		this.dbname = 'store';
		this.styles = ['/store/style.css'];

		this.main = null;
		this.header = null;
		this.summaries = {};
		this.image_cache = {};
		this.store_public_key = '';
		this.store_peer_index = null;
		this.fee = 0;
		this.order_retry_limit = 10;

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
			this.header = new SaitoHeader(this.app, this);
			await this.header.initialize(this.app);
			this.addComponent(this.header);

			this.main = new Main(this.app, this);
			await this.main.initialize();
			this.addComponent(this.main);
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
						syncSummaryCache(this, data);
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
						.returnActiveSummaries()
						.map((summary) => summary.serialize())
				});
				return 1;
			}
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	async render() {
		if (!this.browser_active || !this.main) {
			return;
		}

		await super.render();
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

			case 'order-refund':
				this.app.connection.emit('store-order-refund', { blk, tx, conf });
				console.log('Store: onConfirmation order-refund conf=0', tx.signature);
				if (this.app.BROWSER && typeof siteMessage === 'function') {
					siteMessage('Refund Issued: order could not be processed.', 5000);
				}
				break;

			default:
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

		expressapp.get(`${uri}/cache/:nft_id.img`, function (req, res) {
			const nft_id = decodeURIComponent(String(req.params.nft_id || ''));
			if (!nft_id) {
				return res.status(404).end();
			}
			return serveCachedImageResponse(self, res, nft_id);
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
