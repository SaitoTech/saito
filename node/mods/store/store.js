const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Main = require('./lib/ui/main');
const ProductOverlay = require('./lib/ui/overlays/product');
const index = require('./index');


class Store extends ModTemplate {
	constructor(app) {
		super(app);

		this.name = 'Store';
		this.slug = 'store';

		this.main = null;
		this.header = null;
		this.product_overlay = null;
	}

	async initialize(app) {
		await super.initialize(app);

		if (this.browser_active) {
			this.main = new Main(this.app, this);
			this.header = new SaitoHeader(this.app, this);
		}

		this.product_overlay = new ProductOverlay(this.app, this);
	}

	async render() {

		if (!this.main) {
			return;
		}

		await this.main.render();
		await this.header.render();
	}


        async onConfirmation(blk, tx, conf=0) {

                let txmsg = tx.returnMessage();
                let store_self = this.app.modules.returnModule('Store');

                if (Number(conf) == 0) {
			if (txmsg.module == 'Store') {

				if (txmsg.request == 'list') {
					await store_self.receiveListTransaction(tx);
				}
			}
		}

	}

	async receiveListTransaction(tx) {

	}


	getItemsForSale() {
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
