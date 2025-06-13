const ModTemplate   = require('../../lib/templates/modtemplate');
const statusIndex   = require('./index');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const S = require('saito-js/saito').default;
const NodeCard = require('./lib/node-card');
const jsonTree = require('json-tree-viewer');

class Status extends ModTemplate {
  constructor(app) {
    super(app);
    this.app         = app;
    this.name        = 'status';
    this.description = 'Node + Peer Status Dashboard';
    this.categories  = 'Utilities Dev';
  }

  //
  //  Serve our HTML + static assets under /status
  //
  webServer(app, expressapp, express) {
    const webdir      = `${__dirname}/web`;
    const status_self = this;

    // GET /status → render the HTML
    expressapp.get(
      '/' + encodeURI(this.returnSlug()),
      async function (req, res) {
        res.set('Content-Type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(statusIndex(app, status_self));
      }
    );

    // /status/... → serve everything in mods/status/web
    expressapp.use(
      '/' + encodeURI(this.returnSlug()),
      express.static(webdir)
    );
  }

  async initialize(app) {
    await super.initialize(app);

  }

  async render() {
    let this_self = this;
    //
    // browsers only!
    //
    if (!this.app.BROWSER) {
      return;
    }

    this.header = new SaitoHeader(this.app, this);
    await this.header.initialize(this.app);
    this.addComponent(this.header);


    const stats     = await S.getLibInstance().get_stats();
    const peerStats = await S.getLibInstance().get_peer_stats();
    const container = document.getElementById('status-container');
    container.innerHTML = '';
    
     // render browser card via our new NodeCard class
    this.node_card = new NodeCard(this.app, this, {
       title:     'Browser',
       stats:     JSON.stringify(stats),
       peerStats: JSON.stringify(peerStats),
       onExplore: url => this._openPeer(url),
       onClose:   ()  => {
          if (this.node_card && this.node_card.parentNode) {
            this.node_card.parentNode.removeChild(this.node_card);
          }
       },
     }).render();

    this.addComponent(this.node_card);
    await super.render();
    this.attachEvents();

  }

  attachEvents() {
    if (!this.browser_active) {
      return;
    }
  }

  //
  //  Triggered in-browser once the P2P handshake finishes
  //
  onPeerHandshakeComplete(app, peer) {
    // only run client logic in a real browser
    if (typeof window !== 'undefined') {
      //this._buildUI();
    }
  }

  //
  //  Build the header + initial Browser card
  //
  async _buildUI() {


    // 3) Prepare initial card data
    const stats      = await S.getLibInstance().get_stats();
    const peerStats  = await S.getLibInstance().get_peer_stats();
    const options    = JSON.parse(window.statusOptions || '{}');

    // 4) Render that first “Browser” card
    const container = document.getElementById('status-container');
    container.innerHTML = '';
    const browserCard = this._createCard({
      key:       0,
      title:     'Browser',
      stats:     JSON.stringify(stats),
      peerStats: JSON.stringify(peerStats),
      loading:   false,
      url:       null,
      options,
      onExplore: (peerUrl) => this._openPeer(peerUrl),
      onClose:   ()        => container.innerHTML = '',
    });
    container.appendChild(browserCard);
  }

  //
  //  When you Explore a peer, fetch its stats and re-render its card
  //
  async _openPeer(peerUrl) {
    let this_self = this;
    const container = document.getElementById('status-container');
    // show loading overlay

    try {
      const stats     = await fetch(peerUrl + '/stats').then(r => r.text());
      const peerStats = await fetch(peerUrl + '/stats/peers').then(r => r.text());

      // replace with new card
      let newCard = this._createCard({
        key:       peerUrl,
        title: peerUrl.replace(/https?:\/\//g, ''),
        stats,
        peerStats,
        loading: false,
        url:     peerUrl,
        options: JSON.parse(window.statusOptions || '{}'),
        onExplore: (url) => this._openPeer(url),
        onClose:   ()    => {
          if (newCard && newCard.parentNode) {
            newCard.parentNode.removeChild(newCard);
          }
        },
      });
      container.appendChild(newCard);
    } catch (err) {
      console.error('❌ Failed to fetch peer stats', err);
      container.querySelectorAll('.node-card-content')
        .forEach(el => (el.textContent = 'Error loading peer'));
    }
  }

  //
  //  Create one card (“Browser” or a localhost:XXX peer)
  //  Renders:
  //    • Summary tab (default)
  //    • Peers JSON
  //    • Stats JSON
  //    • Explore tab with clickable URLs
  //
  _createCard({ title, stats, peerStats, loading, url, onExplore, onClose }) {
    // parse peers list
    let peers = [];
    try {
      peers = Object.values(JSON.parse(peerStats).index_to_peers || {});
    } catch {}

    // parse summary fields
    let summary = {};
    try {
      const s = JSON.parse(stats);
      summary = {
        nodeType:      s.node_type           || s.type                   || '—',
        blockHeight:   s.block_height        || s.blockHeight            || (s.blockchain && s.blockchain.head) || '—',
        walletVersion: s.wallet_version      || s.walletVersion          || '—',
        coreVersion:   s.core_version        || s.coreVersion            || '—',
        totalPeers:    peers.length,
        fullPeers:     peers.filter(p => p.static_peer_config?.synctype === 'full').length,
        litePeers:     peers.filter(p => !p.static_peer_config || p.static_peer_config.synctype === 'lite').length,
      };
    } catch {}

    // Build peer URL helper
    const makeUrl = (p) => {
      if (!p.static_peer_config) return 'Browser';
      let u = `${p.static_peer_config.protocol}://\${p.static_peer_config.host}`;
      if ((p.static_peer_config.protocol==='http'  && p.static_peer_config.port!==80) ||
          (p.static_peer_config.protocol==='https' && p.static_peer_config.port!==443)) {
        u += `:${p.static_peer_config.port}`;
      }
      return u;
    };

    // create card container
    const card = document.createElement('div');
    card.className = 'node-card';

    // title + tabs
    card.innerHTML = `
      <div class="node-card-title">
        <span>${title}</span>
        <div>
          <button class="node-card-tab-btn active" data-tab="summary">Summary</button>
          <button class="node-card-tab-btn" data-tab="peerStats">Peers</button>
          <button class="node-card-tab-btn" data-tab="stats">Stats</button>
          <button class="node-card-tab-btn" data-tab="peers">Explore</button>
          <button class="node-card-close">×</button>
        </div>
      </div>
      <div class="node-card-content padded"></div>
    `;

    const content = card.querySelector('.node-card-content');
    let activeTab = 'summary';

    // render content for the given tab
    const renderContent = () => {
      if (loading) {
        content.textContent = 'Loading…';
        return;
      }
      if (activeTab === 'summary') {
        content.innerHTML = `
          <p><strong>Node type:</strong> ${summary.nodeType}</p>
          <p><strong>Attached peers:</strong> ${summary.totalPeers}</p>
          <p><strong>Full peers:</strong> ${summary.fullPeers}</p>
          <p><strong>Browser peers:</strong> ${summary.litePeers}</p>
          <p><strong>Block height:</strong> ${summary.blockHeight}</p>
          <p><strong>Wallet version:</strong> ${summary.walletVersion}</p>
          <p><strong>Core version:</strong> ${summary.coreVersion}</p>
        `;
      } else if (activeTab === 'peerStats') {
//        content.innerHTML = `<pre class="json-view">${JSON.stringify(peers, null, 2)}</pre>`;

            let optjson = JSON.parse(
              JSON.stringify(
                peers,
                (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value // return everything else unchanged
              )
            );
            var tree = jsonTree.create(optjson, content);
      } else if (activeTab === 'stats') {
//        content.innerHTML = `<pre class="json-view">${JSON.stringify(JSON.parse(stats||'{}'), null, 2)}</pre>`;
  
          let optjson = JSON.parse(
              JSON.stringify(
                stats,
                (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value // return everything else unchanged
              )
            );
            var tree = jsonTree.create(optjson, content);
          

      } else if (activeTab === 'peers') {
        const ul = document.createElement('ul');
        ul.className = 'peer-link-list';
        peers.forEach(p => {
          const urlStr = makeUrl(p);
          const li = document.createElement('li');
          li.className = 'peer-link-list-item';
          li.innerHTML = `
            <span class="peer-link">${urlStr}</span>
            <a href="${urlStr}" target="_blank" class="peer-link-external">↗</a>
          `;
          li.querySelector('.peer-link').addEventListener('click', () => onExplore(urlStr));
          ul.appendChild(li);
        });
        content.innerHTML = '';
        content.appendChild(ul);
      }
    };

    // wire up tab buttons
    card.querySelectorAll('.node-card-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeTab = e.currentTarget.dataset.tab;
        card.querySelectorAll('.node-card-tab-btn')
            .forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        renderContent();
      });
    });

    // close button
    card.querySelector('.node-card-close').addEventListener('click', onClose);

    // initial render
    renderContent();
    return card;
  }
}

module.exports = Status;
