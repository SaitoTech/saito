const path = require('path');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');

class Websitex extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'Website';
    this.slug = 'website';
    this.description = 'Experimental Saito project website redesign.';
    this.categories = 'Utilities Communications';
    this.class = 'utility';
    this.inhibit_block_sync_overlay = true;
    this.header = null;
    this.browserConnectedPeers = new Set();
    this.publishBrowserNetworkStatus = null;
    this.nodePeerSnapshot = [];
    this.nodePeerSnapshotUpdatedAt = 0;

    return this;
  }

  async initialize(app) {
    await super.initialize(app);

    if (!app.BROWSER) {
      await this.buildNodePeerSnapshot(app);
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    if (this.browser_active && document.body?.classList.contains('websitex')) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);
    }

    this.publishBrowserNetworkStatus = async (requestedStage = 'syncing', newBlock = false) => {
      try {
        const publicKey =
          (await app.wallet?.getPublicKey?.()) ||
          app.options?.wallet?.publicKey ||
          app.options?.wallet?.publickey ||
          '';
        const networkPeers = (await app.network?.getPeers?.()) || [];
        const peers = networkPeers.map((peer) => ({
          publicKey: peer.publicKey || '',
          host: peer.host || '',
          port: peer.port || 0,
          protocol: peer.protocol || '',
          synctype: peer.synctype || '',
          status: peer.status || '',
          connected: this.browserConnectedPeers.has(peer.publicKey)
        }));
        const configuredPeers = (Array.isArray(app.options?.peers) ? app.options.peers : []).map(
          (peer) => ({
            publicKey: peer.publicKey || peer.publickey || '',
            host: peer.host || '',
            port: peer.port || 0,
            protocol: peer.protocol || '',
            synctype: peer.synctype || '',
            status: peer.status || '',
            connected: this.browserConnectedPeers.has(peer.publicKey || peer.publickey)
          })
        );
        const stage = this.browserConnectedPeers.size ? 'online' : requestedStage;

        window.dispatchEvent(
          new CustomEvent('saito-websitex-status', {
            detail: { stage, publicKey, peers, configuredPeers, newBlock }
          })
        );
      } catch (error) {
        console.warn('Websitex could not publish browser network status:', error);
      }
    };

    window.saitoWebsitex = {
      requestStatus: () => this.publishBrowserNetworkStatus('syncing')
    };

    app.connection.on('peer_connect', (peerId, publicKey) => {
      if (publicKey) {
        this.browserConnectedPeers.add(publicKey);
      }
      this.publishBrowserNetworkStatus('online');
    });

    app.connection.on('peer_disconnect', (peerId, publicKey) => {
      if (publicKey) {
        this.browserConnectedPeers.delete(publicKey);
      }
      this.publishBrowserNetworkStatus('syncing');
    });

    window.setTimeout(() => this.publishBrowserNetworkStatus('syncing'), 0);
  }

  async render() {
    await super.render();

    if (!this.app.BROWSER || !document.body?.classList.contains('websitex')) {
      return;
    }

    const saitoHeader = document.getElementById('saito-header');
    const siteHeader = document.querySelector('[data-site-header]');
    const menuTrigger = document.getElementById('saito-header-menu-toggle');
    const mobileMenuProxy = document.querySelector('[data-menu-toggle]');
    const sidebar = document.querySelector('.saito-header-hamburger-contents');
    const backdrop = document.querySelector('.saito-header-backdrop');

    if (!saitoHeader || !siteHeader || !menuTrigger || !sidebar || !backdrop) {
      return;
    }

    siteHeader.after(saitoHeader);
    document.body.classList.add('saito-shell-ready');

    menuTrigger.setAttribute('role', 'button');
    menuTrigger.setAttribute('tabindex', '0');
    menuTrigger.setAttribute('aria-label', 'Open Saito menu');
    menuTrigger.setAttribute('aria-controls', 'saito-sidebar');
    menuTrigger.setAttribute('aria-expanded', 'false');
    sidebar.id = 'saito-sidebar';

    const syncMenuAccessibility = () => {
      const liveTrigger = document.getElementById('saito-header-menu-toggle');
      const liveSidebar = document.querySelector('.saito-header-hamburger-contents');

      if (!liveTrigger || !liveSidebar) {
        return;
      }

      const isOpen = liveSidebar.classList.contains('show-menu');
      liveTrigger.setAttribute('aria-expanded', String(isOpen));
      liveTrigger.setAttribute('aria-label', isOpen ? 'Close Saito menu' : 'Open Saito menu');

      if (mobileMenuProxy && siteHeader.classList.contains('network-online')) {
        mobileMenuProxy.setAttribute('aria-controls', 'saito-sidebar');
        mobileMenuProxy.setAttribute('aria-expanded', String(isOpen));
        mobileMenuProxy.setAttribute('aria-label', isOpen ? 'Close Saito menu' : 'Open Saito menu');
      }
    };

    const observeSidebar = (liveSidebar) => {
      if (!liveSidebar || liveSidebar.dataset.websitexObserved) {
        return;
      }

      liveSidebar.dataset.websitexObserved = 'true';
      const menuObserver = new window.MutationObserver(syncMenuAccessibility);
      menuObserver.observe(liveSidebar, { attributes: true, attributeFilter: ['class'] });
    };

    const toggleSaitoMenu = () => {
      // Saito can replace its header while the page is running, so never retain references
      // to the drawer between proxy clicks.
      const liveSidebar = document.querySelector('.saito-header-hamburger-contents');
      const liveBackdrop = document.querySelector('.saito-header-backdrop');

      if (!liveSidebar || !liveBackdrop) {
        return;
      }

      observeSidebar(liveSidebar);
      const shouldOpen = !liveSidebar.classList.contains('show-menu');

      // Set one explicit state. Forwarding a synthetic click and then checking fallbacks made
      // the handoff timing-dependent when the live header was re-rendering.
      if (shouldOpen && this.header?.openMenu) {
        this.header.openMenu();
      } else if (!shouldOpen && this.header?.hideMenu) {
        this.header.hideMenu();
      } else {
        liveSidebar.classList.toggle('show-menu', shouldOpen);
        liveSidebar.classList.remove('show-wallet');
        liveBackdrop.classList.toggle('menu-visible', shouldOpen);
      }

      syncMenuAccessibility();
    };

    window.saitoWebsitex.toggleMenu = toggleSaitoMenu;

    if (!menuTrigger.dataset.websitexBound) {
      menuTrigger.dataset.websitexBound = 'true';
      observeSidebar(sidebar);

      menuTrigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          menuTrigger.click();
        }
      });
    }

    syncMenuAccessibility();
  }

  respondTo(type = '', obj = null) {
    if (type === 'saito-header') {
      return [
        {
          text: 'Docs',
          icon: 'fas fa-book-open',
          rank: 90,
          type: 'navigation',
          callback: () => window.open('https://wiki.saito.io/', '_blank', 'noopener')
        }
      ];
    }

    return super.respondTo(type, obj);
  }

  async onPeerHandshakeComplete(app, peer) {
    if (!app.BROWSER || !this.publishBrowserNetworkStatus) {
      return;
    }

    if (peer?.publicKey) {
      this.browserConnectedPeers.add(peer.publicKey);
    }
    await this.publishBrowserNetworkStatus('online');
  }

  async buildNodePeerSnapshot(app = this.app) {
    try {
      const networkPeers = (await app.core?.network?.getPeers?.()) || [];
      const ownPublicKey = (await app.wallet?.getPublicKey?.()) || '';
      this.nodePeerSnapshot = networkPeers
        .filter((peer) => !ownPublicKey || peer.publicKey !== ownPublicKey)
        .map((peer) => ({
          id: peer.id?.toString?.() || '',
          publicKey: peer.publicKey || '',
          host: peer.host || '',
          port: peer.port || 0,
          protocol: peer.protocol || '',
          synctype: peer.synctype || '',
          status: peer.status || '',
          connected: true
        }));
      this.nodePeerSnapshotUpdatedAt = Date.now();
    } catch (error) {
      console.warn('Websitex could not update the node peer snapshot:', error);
    }

    return this.nodePeerSnapshot;
  }

  async onNewBlock(blk, lc) {
    if (this.app.BROWSER && this.publishBrowserNetworkStatus) {
      await this.publishBrowserNetworkStatus('online', true);
    } else if (!this.app.BROWSER) {
      await this.buildNodePeerSnapshot(this.app);
    }
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    const uri = alternative_slug || `/${encodeURI(this.returnSlug())}`;
    const webdir = path.join(__dirname, 'web');
    const routeUri = uri === '/' ? '' : uri.replace(/\/$/, '');
    const trafficAnimation = path.join(__dirname, '../website/web/img/saito_bottom.svg');

    expressapp.get(`${routeUri}/useful-traffic-animation.svg`, (req, res) => {
      res.sendFile(trafficAnimation);
    });

    expressapp.get(`${routeUri}/network-status`, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');

      try {
        const endpoint = app.server?.server?.endpoint || app.options?.server?.endpoint || {};
        const publicKey = (await app.wallet?.getPublicKey?.()) || endpoint.publicKey || '';
        const peers = this.nodePeerSnapshotUpdatedAt
          ? this.nodePeerSnapshot
          : await this.buildNodePeerSnapshot(app);

        res.json({
          publicKey,
          endpoint: {
            host: endpoint.host || '',
            port: endpoint.port || 0,
            protocol: endpoint.protocol || '',
            publicKey: endpoint.publicKey || publicKey
          },
          peers,
          updatedAt: this.nodePeerSnapshotUpdatedAt
        });
      } catch (error) {
        res.status(503).json({ error: 'Network status is temporarily unavailable.' });
      }
    });

    expressapp.use(uri, express.static(webdir));
  }
}

module.exports = Websitex;
