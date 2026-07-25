const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const PeerService = require('saito-js/lib/peer_service').default;
const Main = require('./lib/ui/main');
const Warehouse = require('./lib/warehouse');
const transactions = require('./lib/transactions');
const { serveCachedImageResponse } = require('./lib/images');
const { syncSummaryCache } = require('./lib/ui/summary-cache');
const { DEFAULT_PAGE_SIZE, normalizePage, normalizePageSize } = require('./lib/categories');
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

    if (this.app.BROWSER) {
      const SaitoTransactionMonitor = require('../../lib/saito/ui/saito-transaction-monitor/saito-transaction-monitor');
      this.transaction_monitor = new SaitoTransactionMonitor(this.app, this);
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

    if (this.main?.loadBrowsePage) {
      this.main.loadBrowsePage({ category: '', page: 1 });
      return;
    }

    this.app.network.sendRequestAsTransaction(
      'load-listings',
      { module: 'Store', category: '', page: 1, page_size: DEFAULT_PAGE_SIZE },
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
        const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
        const result = this.warehouse.returnActiveSummariesPage({
          category: data.category || '',
          page: normalizePage(data.page),
          page_size: normalizePageSize(data.page_size)
        });
        mycallback({
          listings: result.listings.map((summary) => summary.serialize()),
          category: result.category,
          pagination: result.pagination
        });
        return 1;
      }
    }

    if (txmsg?.request === 'load-seller-inventory') {
      if (!this.app.BROWSER && mycallback != null) {
        const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
        const seller = String(data.seller || '').trim();
        const result = await this.warehouse.returnSellerInventory(seller);
        mycallback({
          seller: result.seller,
          active: (result.active || []).map((summary) => summary.serialize()),
          sold: (result.sold || []).map((summary) => summary.serialize())
        });
        return 1;
      }
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  respondTo(type = '') {
    if (type === 'saito-sell-nft') {
      return {
        render: (defaults = {}) => {
          if (this.app.BROWSER && typeof this.attachStyleSheets === 'function') {
            this.attachStyleSheets();
          }

          if (this.main?.openSell) {
            this.main.openSell(defaults);
            return;
          }

          if (!this.listing_overlay) {
            const NftPickerOverlay = require('./lib/ui/overlays/nft-picker');
            const ListingDetailOverlay = require('./lib/ui/overlays/listing-detail');
            const nft_picker = new NftPickerOverlay(this.app, this);
            const listing_detail = new ListingDetailOverlay(this.app, this);
            nft_picker.onSelect = (nft, defs) => {
              listing_detail.render({ mode: 'edit', nft, defaults: defs });
            };
            listing_detail.onBack = (defs) => {
              nft_picker.render(defs || {});
            };
            this.listing_overlay = {
              render: (defs = {}) => {
                if (defs?.nft) {
                  listing_detail.render({ mode: 'edit', nft: defs.nft, defaults: defs });
                } else {
                  nft_picker.render(defs);
                }
              }
            };
          }

          this.listing_overlay.render(defaults);
        }
      };
    }

    return super.respondTo(type);
  }

  /**
   * Path for a public creator storefront: /store/<publickey>
   */
  returnStorefrontPath(publicKey = '') {
    const key = String(publicKey || '').trim();
    if (!key) {
      return '/' + encodeURI(this.returnSlug());
    }
    return `/${encodeURI(this.returnSlug())}/${encodeURIComponent(key)}`;
  }

  /**
   * Path for seller administration: /store/<publickey>/admin
   */
  returnAdminPath(publicKey = '') {
    const base = this.returnStorefrontPath(publicKey);
    if (!String(publicKey || '').trim()) {
      return base;
    }
    return `${base}/admin`;
  }

  /**
   * Absolute shareable URL for a public creator storefront.
   */
  returnStorefrontUrl(publicKey = '') {
    const path = this.returnStorefrontPath(publicKey);
    if (this.app.BROWSER && typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }

  /**
   * Absolute URL for seller administration.
   */
  returnAdminUrl(publicKey = '') {
    const path = this.returnAdminPath(publicKey);
    if (this.app.BROWSER && typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }

  async render() {
    if (!this.browser_active || !this.main) {
      return;
    }

    await super.render();

    const route = this.returnStoreRouteFromPath();
    if (route.publicKey) {
      await this.main.openStorefront(route.publicKey, {
        updateUrl: false,
        admin: route.admin
      });
    }
  }

  /**
   * Parse /store/<publickey> or /store/<publickey>/admin from the current path.
   * @returns {{ publicKey: string, admin: boolean }}
   */
  returnStoreRouteFromPath() {
    if (!this.app.BROWSER || typeof window === 'undefined') {
      return { publicKey: '', admin: false };
    }

    const pathname = window.location.pathname || '';
    const slug = '/' + this.slug;
    if (!pathname.startsWith(slug)) {
      return { publicKey: '', admin: false };
    }

    const segments = pathname
      .substring(slug.length)
      .split('/')
      .filter((seg) => seg.length > 0);

    if (segments.length === 1 && segments[0] !== 'cache') {
      return {
        publicKey: decodeURIComponent(segments[0]),
        admin: false
      };
    }

    if (segments.length === 2 && segments[0] !== 'cache' && segments[1] === 'admin') {
      return {
        publicKey: decodeURIComponent(segments[0]),
        admin: true
      };
    }

    return { publicKey: '', admin: false };
  }

  /**
   * Parse /store/<publickey> (or admin) public key from the current browser path.
   */
  returnStorefrontKeyFromPath() {
    return this.returnStoreRouteFromPath().publicKey;
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

    const sendStoreHtml = (req, res) => {
      const html = index(app, self, app.build_number);
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      return res.send(html);
    };

    expressapp.get(`${uri}/cache/:nft_id.img`, function (req, res) {
      const nft_id = decodeURIComponent(String(req.params.nft_id || ''));
      if (!nft_id) {
        return res.status(404).end();
      }
      return serveCachedImageResponse(self, res, nft_id);
    });

    expressapp.use(uri, express.static(webdir));

    // /store — main browse shell
    expressapp.get(uri, sendStoreHtml);

    // /store/<publickey>/admin — seller administration shell (client routes after load)
    expressapp.get(`${uri}/:publickey/admin`, sendStoreHtml);

    // /store/<publickey> — public creator storefront shell (client routes after load)
    expressapp.get(`${uri}/:publickey`, sendStoreHtml);
  }
}

module.exports = Store;
