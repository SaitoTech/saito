const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const PeerService = require('saito-js/lib/peer_service').default;
const Main = require('./lib/ui/main');
const Warehouse = require('./lib/warehouse');
const transactions = require('./lib/transactions');
const { serveCachedImageResponse } = require('./lib/images');
const { normalizeOffset, normalizePageSize } = require('./lib/categories');
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
    this.listings_to_moderate = 0;
    this.fee = 0;
    this.order_retry_limit = 10;
    // User-store chrome is read-only; edits stay on Profile / Red Square hosts.
    this.enable_profile_edits = false;

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
      const PurchaseMonitor = require('./lib/ui/overlays/purchase-monitor');
      this.transaction_monitor = new SaitoTransactionMonitor(this.app, this);
      this.purchase_monitor = new PurchaseMonitor(this.app, this);

      const DelistOverlay = require('./lib/ui/overlays/delist-overlay');
      this.delist_overlay = new DelistOverlay(this.app, this);

      // TEMP: prove store-nft-rental arrives self-contained with Vault fields.
      this._store_rental_receipt_alerts = new Set();
      this.app.connection.on('on-nft-received', (payload) => {
        void this.alertStoreRentalReceipt(payload);
      });

      this.app.connection.on('store-listing-lifecycle', (entry) => {
        if (entry?.phase === 'complete') {
          void this.maybePublishStoreProfileLink(entry);
        }
      });
    }

    if (this.browser_active) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);

      this.main = new Main(this.app, this);
      await this.main.initialize();
      this.addComponent(this.main);

      // Chat is optional: wake ChatManager for popups only (no sidebar list).
      const cm = this.app.modules.returnFirstRespondTo?.('chat-manager');
      if (cm) {
        cm.render_popups_to_screen = 1;
        cm.render_manager_to_screen = 0;
      }
    }
  }

  /**
   * Ask Profile (if installed) to set or clear the preferred storefront URL.
   * Blank address removes the Profile `store` field. No-op when Profile is absent.
   */
  async updateProfile(address = '') {
    if (!this.app.BROWSER) {
      return;
    }

    const api = this.app.modules.returnFirstRespondTo('profile-update');
    if (!api || typeof api.update !== 'function') {
      return;
    }

    const store = address == null ? '' : String(address).trim();
    await api.update({ store });
  }

  /**
   * TEMP debug: when a store-nft-rental arrives from another party, load the
   * received NFT txmsg and alert Vault/rental fields. One alert per nft_id.
   */
  async alertStoreRentalReceipt(payload = {}) {
    if (!this.app.BROWSER) {
      return;
    }

    const nft_id = String(payload?.nft_id || payload?.id || '').trim();
    const slip3 = String(payload?.slip3_utxo || '').trim();
    if (!nft_id || !slip3) {
      return;
    }

    const slip_type = this.app.wallet.extractNFTType(slip3);
    if (slip_type !== 'store-nft-rental') {
      return;
    }

    // Newly received from someone else — not self-mint / local wallet noise.
    if (payload?.sender && payload.sender === this.publicKey) {
      return;
    }

    if (this._store_rental_receipt_alerts.has(nft_id)) {
      return;
    }
    this._store_rental_receipt_alerts.add(nft_id);

    try {
      await this.app.wallet.updateNFTList();
      const rec = (this.app.options?.wallet?.nfts || []).find(
        (row) => String(row?.id || '') === nft_id
      );
      if (!rec) {
        return;
      }

      const SaitoNFT = require('../../lib/saito/ui/saito-nft/saito-nft');
      const nft = new SaitoNFT(this.app, this, null, rec);
      if (typeof nft.fetchTransaction === 'function') {
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };
          nft.fetchTransaction(finish);
          setTimeout(finish, 8000);
        });
      }
      if (typeof nft.buildNFTData === 'function' && nft.tx) {
        nft.buildNFTData(nft.tx);
      }

      const data = nft.tx?.returnMessage?.()?.data || nft.data || {};
      alert(
        [
          'TEMP store-nft-rental receipt',
          `link: ${data.link ?? ''}`,
          `nft_type: ${data.nft_type ?? ''}`,
          `filename: ${data.filename ?? ''}`,
          `file_id: ${data.file_id ?? ''}`,
          `file_access_script: ${
            typeof data.file_access_script === 'string'
              ? data.file_access_script
              : JSON.stringify(data.file_access_script ?? '')
          }`
        ].join('\n')
      );
    } catch (err) {
      console.warn('Store: rental receipt alert failed', err?.message || err);
    }
  }

  /**
   * Current Profile `store` field via optional profile-update capability.
   */
  returnProfileStoreUrl() {
    const api = this.app.modules.returnFirstRespondTo?.('profile-update');
    if (!api || typeof api.get !== 'function') {
      return '';
    }
    try {
      const profile = api.get() || {};
      return String(profile.store || '').trim();
    } catch (err) {
      return '';
    }
  }

  /**
   * After the seller's first successful listing, publish the storefront URL to Profile.
   * Later listings no-op (Profile already has the URL, or inventory count > 1 after uncheck).
   */
  async maybePublishStoreProfileLink(entry = {}) {
    if (!this.app.BROWSER || !this.publicKey) {
      return;
    }
    if (entry.seller && entry.seller !== this.publicKey) {
      return;
    }

    const url = this.returnStorefrontUrl(this.publicKey);
    if (!url) {
      return;
    }
    if (this.returnProfileStoreUrl() === url) {
      return;
    }

    try {
      const { loadListingsPage } = require('./lib/ui/browse-listings');
      const result = await loadListingsPage(this.app, this, {
        public_key: this.publicKey,
        category: '',
        offset: 0,
        page_size: 1
      });
      const total = Number(result?.pagination?.total ?? result?.listings?.length ?? 0);
      if (total !== 1) {
        return;
      }
      await this.updateProfile(url);
      this.app.connection.emit('store-profile-link-updated');
    } catch (err) {
      console.warn('Store: profile store link publish skipped', err?.message || err);
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

    if (!this.app.BROWSER) {
      return;
    }

    this.store_public_key = peer.publicKey;
    this.store_peer_index = peer.peerIndex;
    console.log('Store: onPeerServiceUp store_public_key=', this.store_public_key);

    if (this.browser_active || Number(this.app.options?.store?.moderator) === 1) {
      this.requestStoreModerationState();
    }

    if (!this.browser_active || !this.main?.manager) {
      return;
    }

    // Peer readiness only enables fetch — do not change which Store context is active.
    const manager = this.main.manager;
    if (manager.activePanel === 'my-listings') {
      void manager.storefront.reloadInventory();
      return;
    }
    if (manager.activePanel === 'sales') {
      void manager.sales.show();
      return;
    }
    if (manager.activePanel === 'moderate') {
      void manager.moderate?.reload?.();
      return;
    }
    void manager.browse.loadPage({
      category: manager.browse.category,
      page: manager.browse.page || 1,
      scroll: false
    });
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (tx == null) {
      return 0;
    }

    let txmsg = tx.returnMessage();

    if (txmsg?.request === 'store-moderation-response') {
      if (this.app.BROWSER) {
        this.applyStoreModerationResponse(txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : txmsg);
        return 1;
      }
    }

    if (txmsg?.request === 'store-moderation') {
      if (!this.app.BROWSER && mycallback != null) {
        const authorized = this.isStoreAdmin(tx) ? 1 : 0;
        let pending = 0;
        if (authorized) {
          pending = await this.warehouse.db.countPendingModerationListings();
        }
        mycallback({
          request: 'store-moderation-response',
          authorized,
          pending
        });
        return 1;
      }
    }

    if (txmsg?.request === 'load-pending-listings') {
      if (!this.app.BROWSER && mycallback != null) {
        if (!this.isStoreAdmin(tx)) {
          mycallback({
            err: 'Unauthorized access',
            authorized: 0,
            pending: 0,
            listings: []
          });
          return 1;
        }

        const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
        const result = await this.warehouse.returnPendingModerationPage({
          offset: normalizeOffset(data.offset),
          page_size: normalizePageSize(data.page_size),
          sort: data.sort,
          direction: data.direction
        });
        const pending = await this.warehouse.db.countPendingModerationListings();
        mycallback({
          authorized: 1,
          pending,
          listings: result.listings.map((summary) => summary.serialize()),
          sort: result.sort,
          direction: result.direction,
          pagination: result.pagination
        });
        return 1;
      }
    }

    if (txmsg?.request === 'moderate-listings') {
      if (!this.app.BROWSER && mycallback != null) {
        if (!this.isStoreAdmin(tx)) {
          mycallback({
            err: 'Unauthorized access',
            authorized: 0,
            pending: 0,
            results: []
          });
          return 1;
        }

        const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
        const action = String(data.action || '')
          .trim()
          .toLowerCase();
        if (action !== 'approve' && action !== 'reject') {
          mycallback({ err: 'Invalid action', results: [] });
          return 1;
        }

        const signatures = Array.isArray(data.signatures)
          ? [...new Set(data.signatures.map((sig) => String(sig || '').trim()).filter(Boolean))]
          : [];
        const results = [];
        for (const signature of signatures) {
          const result = await this.warehouse.db.moderatePendingListing(signature, action);
          results.push({
            signature,
            ok: !!result?.ok,
            approved: result?.approved,
            err: result?.err || ''
          });
        }

        const pending = await this.warehouse.db.countPendingModerationListings();
        mycallback({
          authorized: 1,
          pending,
          results
        });
        return 1;
      }
    }

    if (txmsg?.request === 'load-listings') {
      if (!this.app.BROWSER && mycallback != null) {
        const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
        const public_key = String(data.public_key || '').trim();
        let result;
        if (public_key) {
          result = await this.warehouse.returnActiveListingsPage({
            sellers: [public_key],
            category: data.category || '',
            offset: normalizeOffset(data.offset),
            page_size: normalizePageSize(data.page_size),
            status: data.status
          });
        } else {
          const modtools = this.app.modules.returnModuleBySlug('modtools');
          const whitelist_sellers = Array.isArray(modtools?.whitelisted_publickeys)
            ? modtools.whitelisted_publickeys.slice()
            : [];
          result = await this.warehouse.returnMarketplaceListingsPage({
            whitelist_sellers,
            category: data.category || '',
            offset: normalizeOffset(data.offset),
            page_size: normalizePageSize(data.page_size)
          });
        }
        const listings = result.listings.map((summary) => summary.serialize());
        mycallback({
          listings,
          public_key,
          category: result.category,
          pagination: result.pagination
        });
        return 1;
      }
    }

    if (txmsg?.request === 'submit-listing') {
      if (!this.app.BROWSER && mycallback != null) {
        const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
        const signature = String(data.signature || '').trim();
        const requester = String(tx.from?.[0]?.publicKey || '').trim();

        if (!signature) {
          mycallback({ err: 'Listing signature required' });
          return 1;
        }
        if (!requester) {
          mycallback({ err: 'Unauthorized' });
          return 1;
        }

        const row = await this.warehouse.db.returnListingBySignature(signature);
        if (!row) {
          mycallback({ err: 'Listing not found' });
          return 1;
        }
        if (String(row.seller || '') !== requester) {
          mycallback({ err: 'Unauthorized' });
          return 1;
        }

        const result = await this.warehouse.db.submitListingForMainStore(signature);
        if (!result?.ok) {
          mycallback({ err: result?.err || 'Unable to submit listing' });
          return 1;
        }

        mycallback({
          ok: true,
          signature,
          approved: result.approved,
          unchanged: !!result.unchanged
        });
        return 1;
      }
    }

    if (txmsg?.request === 'review-listing') {
      if (!this.app.BROWSER && mycallback != null) {
        if (!this.isStoreAdmin(tx)) {
          mycallback({ err: 'Unauthorized access' });
          return 1;
        }

        const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
        const signature = String(data.signature || '').trim();
        const action = String(data.action || '')
          .trim()
          .toLowerCase();

        if (!signature) {
          mycallback({ err: 'Listing signature required' });
          return 1;
        }
        if (action !== 'approve' && action !== 'unapprove') {
          mycallback({ err: 'Invalid action' });
          return 1;
        }

        const row = await this.warehouse.db.returnListingBySignature(signature);
        if (!row) {
          mycallback({ err: 'Listing not found' });
          return 1;
        }

        const approved = action === 'approve';
        const ok = await this.warehouse.db.setListingApproved(signature, approved);
        if (!ok) {
          mycallback({ err: 'Unable to update listing' });
          return 1;
        }

        mycallback({
          signature,
          approved: approved ? 1 : 0
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

    if (txmsg?.request === 'load-listing-spend') {
      if (!this.app.BROWSER && mycallback != null) {
        const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
        const signature = String(data.signature || '').trim();
        const requester = String(tx.from?.[0]?.publicKey || '').trim();
        const row = signature
          ? await this.warehouse.db.returnListingBySignature(signature)
          : null;
        const Listing = require('./lib/listing');
        const listing = row ? new Listing(row) : null;
        if (!listing || !listing.isAvailable() || !requester || listing.seller !== requester) {
          mycallback(null);
          return 1;
        }
        mycallback({
          signature: listing.signature,
          nft_id: listing.nft_id,
          seller: listing.seller,
          quantity: listing.quantity,
          price: listing.price,
          category: listing.category,
          access_script: listing.access_script,
          access_hash: listing.access_hash,
          p2sh_address: listing.p2sh_address,
          utxo_slip1: listing.utxo_slip1,
          utxo_slip2: listing.utxo_slip2,
          utxo_slip3: listing.utxo_slip3
        });
        return 1;
      }
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  requestStoreModerationState() {
    if (!this.app.BROWSER) {
      return;
    }
    const peerKey = this.store_public_key;
    if (!peerKey || !this.app?.network?.sendRequestAsTransaction) {
      return;
    }

    this.app.network.sendRequestAsTransaction(
      'store-moderation',
      { module: 'Store' },
      (response) => {
        this.applyStoreModerationResponse(response);
      },
      peerKey,
      true
    );
  }

  applyStoreModerationResponse(response = {}) {
    if (!this.app.BROWSER) {
      return;
    }

    const payload =
      response && typeof response === 'object'
        ? response.request === 'store-moderation-response' &&
          response.data &&
          typeof response.data === 'object'
          ? response.data
          : response
        : {};

    const authorized = Number(payload.authorized) === 1 ? 1 : 0;
    const pending = authorized ? Math.max(0, Number(payload.pending) || 0) : 0;

    this.listings_to_moderate = pending;
    this.main?.menu?.showModeration?.(this.listings_to_moderate);
    this.app.connection.emit('saito-notification', {
      id: 'store-moderation',
      text: 'There are new listings on the Store to moderate.',
      href: '/store/moderate',
      pending: this.listings_to_moderate
    });

    if (!this.app.options || typeof this.app.options !== 'object') {
      this.app.options = {};
    }
    if (!this.app.options.store || typeof this.app.options.store !== 'object') {
      this.app.options.store = {};
    }
    this.app.options.store.moderator = authorized;
    this.app.storage?.saveOptions?.();
  }

  /**
   * Listing approval is node-operator policy. Requires app.options.admin
   * and a signed request from one of those keys. An empty admin list
   * authorizes nobody (unlike Admin module's open-if-unconfigured default).
   */
  isStoreAdmin(tx) {
    const admins = Array.isArray(this.app.options?.admin) ? this.app.options.admin : [];
    if (!admins.length || !tx) {
      return false;
    }
    return admins.some((key) => {
      try {
        return tx.isFrom(key);
      } catch (err) {
        return false;
      }
    });
  }

  respondTo(type = '', obj) {
    if (type === 'redsquare-profile') {
      const publicKey = String(obj?.publicKey || '').trim();
      if (!publicKey) {
        return null;
      }

      let link = String(obj?.profile?.store || '').trim();
      if (!link) {
        const api = this.app.modules.returnFirstRespondTo?.('profile-update');
        if (api && typeof api.get === 'function') {
          try {
            const profile = api.get(publicKey) || {};
            link = String(profile.store || '').trim();
          } catch (err) {
            link = '';
          }
        }
      }
      if (!link) {
        return null;
      }

      return {
        text: 'Store',
        link
      };
    }

    if (type === 'user-menu') {
      const publicKey = String(obj?.publicKey || '').trim();
      if (!publicKey) {
        return null;
      }

      return {
        text: publicKey === this.publicKey ? 'My Store' : 'View Store',
        icon: 'fa-solid fa-store',
        callback: (app, key) => {
          navigateWindow(this.returnStorefrontPath(key));
        }
      };
    }

    if (type === 'saito-header') {
      if (this.browser_active) {
        return [];
      }

      return [
        {
          text: 'Store',
          icon: 'fa-solid fa-store',
          rank: 15,
          type: 'navigation',
          navigation: '/store',
          callback: () => {
            navigateWindow('/store');
          }
        }
      ];
    }

    if (type === 'saito-create-nft') {
      return {
        title: 'Store Rental NFT',
        class: ['store-nft-rental'],
        upload_text: 'drag-and-drop image for this rental listing',
        createData: async (modfile, metadata = {}) => {
          const image =
            metadata.image ||
            (modfile && String(modfile).startsWith('data:image') ? modfile : '') ||
            '';
          if (!image) {
            salert('Attach an image for the Rental NFT');
            return false;
          }
          if (!metadata.file_id) {
            salert('Missing Vault file_id for this rental NFT');
            return false;
          }
          if (!metadata.link) {
            salert('Missing Vault link for this rental NFT');
            return false;
          }
          if (!metadata.filename) {
            salert('Missing Vault filename for this rental NFT');
            return false;
          }
          if (!metadata.file_access_script) {
            salert('Missing Vault file_access_script for this rental NFT');
            return false;
          }
          if (!metadata.nft_type) {
            salert('Missing source nft_type for this rental NFT');
            return false;
          }

          let hours = parseInt(metadata.duration_hours, 10);
          if (!Number.isFinite(hours) || hours < 1) {
            hours = 1;
          }
          if (hours > 24) {
            hours = 24;
          }

          const duration_ms =
            Number(metadata.duration_ms) > 0 ? Number(metadata.duration_ms) : hours * 60 * 60 * 1000;

          // Vault protected-file fields stay on txmsg.data under established names.
          // Slip/NFT type remains store-nft-rental; data.nft_type is the source type.
          return {
            module: 'Store',
            link: String(metadata.link),
            nft_type: String(metadata.nft_type),
            filename: String(metadata.filename),
            file_id: String(metadata.file_id),
            file_access_script:
              typeof metadata.file_access_script === 'string'
                ? metadata.file_access_script
                : JSON.stringify(metadata.file_access_script),
            duration_hours: hours,
            duration_ms,
            rights: metadata.rights || 'all',
            image
          };
        }
      };
    }

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
            const RentalListingOverlay = require('./lib/ui/overlays/rental-listing');
            const { normalizeListingMode } = require('./lib/categories');
            const nft_picker = new NftPickerOverlay(this.app, this);
            const listing_detail = new ListingDetailOverlay(this.app, this);
            const rental_listing = new RentalListingOverlay(this.app, this);
            nft_picker.onSelect = (nft, defs) => {
              if (normalizeListingMode(defs?.listing_mode) === 'rent') {
                rental_listing.render({ source_nft: nft, defaults: defs });
                return;
              }
              listing_detail.render({ mode: 'edit', nft, defaults: defs });
            };
            listing_detail.onBack = (defs) => {
              nft_picker.render(defs || {});
            };
            rental_listing.onBack = (defs) => {
              nft_picker.render({ ...(defs || {}), listing_mode: 'rent' });
            };
            this.listing_overlay = {
              render: (defs = {}) => {
                const next = {
                  ...defs,
                  listing_mode: normalizeListingMode(defs.listing_mode)
                };
                if (next?.nft) {
                  if (next.listing_mode === 'rent') {
                    rental_listing.render({ source_nft: next.nft, defaults: next });
                  } else {
                    listing_detail.render({ mode: 'edit', nft: next.nft, defaults: next });
                  }
                } else {
                  nft_picker.render(next);
                }
              }
            };
          }

          this.listing_overlay.render(defaults);
        }
      };
    }

    //
    // store-nft-rental transfers: mutate the EXISTING Bound NFT transfer by
    // appending a hop on tx.msg.data.path (Stack pattern). Default delegated: 0;
    // Store listing passes { delegated: true }. Does not create/sign/propagate.
    //
    if (type === 'saito-nft-transfer') {
      let this_mod = this;
      return {
        class: ['store-nft-rental'],
        onTransfer: async (nft = null, tx = null, receiver = '', data = {}) => {
          if (!tx) {
            return tx;
          }

          if (!tx.msg) {
            tx.msg = {};
          }
          if (!tx.msg.data || typeof tx.msg.data !== 'object') {
            tx.msg.data = {};
          }
          if (!Array.isArray(tx.msg.data.path)) {
            tx.msg.data.path = [];
          }

          receiver = String(receiver || '').trim();
          if (!receiver) {
            return tx;
          }

          let expires_at = null;
          if (tx.msg.data.expires_at != null && tx.msg.data.expires_at !== '') {
            expires_at = Number(tx.msg.data.expires_at);
          } else {
            const nft_data = nft?.tx?.returnMessage?.()?.data || nft?.data || {};
            const duration_ms = Number(nft_data.duration_ms || tx.msg.data.duration_ms);
            if (Number.isFinite(duration_ms) && duration_ms > 0) {
              expires_at = Date.now() + duration_ms;
            }
          }
          if (expires_at == null || !Number.isFinite(expires_at)) {
            throw new Error('store-nft-rental transfer requires expires_at or duration_ms');
          }
          tx.msg.data.expires_at = expires_at;

          let file_id = tx.msg.data.file_id || null;
          if (!file_id) {
            const nft_data = nft?.tx?.returnMessage?.()?.data || nft?.data || null;
            if (nft_data?.file_id) {
              file_id = nft_data.file_id;
            }
          }
          if (!file_id && nft?.json) {
            try {
              const parsed = typeof nft.json === 'string' ? JSON.parse(nft.json) : nft.json;
              file_id = parsed?.file_id || parsed?.data?.file_id || null;
            } catch (err) {
              file_id = null;
            }
          }
          if (!file_id) {
            throw new Error('store-nft-rental transfer requires file_id');
          }
          file_id = String(file_id);
          tx.msg.data.file_id = file_id;

          // Transfer context only — never infer from NFT type.
          const delegated = data && data.delegated === true ? 1 : 0;
          const value_obj = {
            timestamp: Date.now(),
            file_id: file_id,
            expires_at: Number(expires_at),
            delegated: delegated
          };
          const value_b64 = Buffer.from(JSON.stringify(value_obj)).toString('base64');
          const binding_hash = '';
          const canonical_string = `${receiver}|${value_b64}|${binding_hash}`;
          const hash_digest = this_mod.app.crypto.hash(canonical_string);
          const privatekey = await this_mod.app.wallet.getPrivateKey();
          const sig = this_mod.app.crypto.signMessage(hash_digest, privatekey);

          tx.msg.data.path.push({
            to: receiver,
            value: value_b64,
            sig: sig
          });

          return tx;
        }
      };
    }

    return super.respondTo(type, obj);
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
    if (route.moderate) {
      await this.main.openModerate({ updateUrl: false });
      return;
    }
    if (route.publicKey) {
      await this.main.openStorefront(route.publicKey, {
        updateUrl: false,
        admin: route.admin
      });
    }
  }

  /**
   * Parse /store/<publickey>, /store/<publickey>/admin, or /store/moderate.
   * @returns {{ publicKey: string, admin: boolean, moderate: boolean }}
   */
  returnStoreRouteFromPath() {
    if (!this.app.BROWSER || typeof window === 'undefined') {
      return { publicKey: '', admin: false, moderate: false };
    }

    const pathname = window.location.pathname || '';
    const slug = '/' + this.slug;
    if (!pathname.startsWith(slug)) {
      return { publicKey: '', admin: false, moderate: false };
    }

    const segments = pathname
      .substring(slug.length)
      .split('/')
      .filter((seg) => seg.length > 0);

    if (segments.length === 1 && segments[0] === 'moderate') {
      return { publicKey: '', admin: false, moderate: true };
    }

    if (segments.length === 1 && segments[0] !== 'cache') {
      return {
        publicKey: decodeURIComponent(segments[0]),
        admin: false,
        moderate: false
      };
    }

    if (segments.length === 2 && segments[0] !== 'cache' && segments[1] === 'admin') {
      return {
        publicKey: decodeURIComponent(segments[0]),
        admin: true,
        moderate: false
      };
    }

    return { publicKey: '', admin: false, moderate: false };
  }

  /**
   * Parse /store/<publickey> (or admin) public key from the current browser path.
   */
  returnStorefrontKeyFromPath() {
    return this.returnStoreRouteFromPath().publicKey;
  }

  shouldAffixCallbackToModule(modname, tx = null) {
    if (modname === this.name) {
      return 1;
    }
    // Allow the shared transaction monitor to receive confirmations it is watching.
    if (
      this.transaction_monitor?.tx &&
      tx?.signature &&
      tx.signature === this.transaction_monitor.tx.signature
    ) {
      return 1;
    }
    return 0;
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

      case 'delist-asset':
        console.log('Store: onConfirmation delist-asset conf=0', tx.signature);
        await this.receiveDelistAssetTransaction(blk, tx);
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

    // /store/moderate — marketplace moderation (must precede /:publickey)
    expressapp.get(`${uri}/moderate`, sendStoreHtml);

    // /store/<publickey>/admin — seller administration shell (client routes after load)
    expressapp.get(`${uri}/:publickey/admin`, sendStoreHtml);

    // /store/<publickey> — public creator storefront shell (client routes after load)
    expressapp.get(`${uri}/:publickey`, sendStoreHtml);
  }
}

module.exports = Store;
