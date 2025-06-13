const NodeCardTemplate = require('./node-card.template');
const S = require('saito-js/saito').default;
const jsonTree = require('json-tree-viewer');

class NodeCard {
  /**
   * props = { title, stats, peerStats, onExplore, onClose }
   */
  static _nextKey = 1;
  constructor(app, mod, props) {
    this.app       = app;
    this.mod       = mod;
    this.props     = props;
    this.container = '#status-container';
    if (!props.key) {
      props.key = `nodecard-${NodeCard._nextKey}`;
      NodeCard._nextKey += 1;
    }

  }

  async render() {
    this.app.browser.addElementToSelector(
      NodeCardTemplate(this.app, this.mod, this.props),
      this.container
    );

    await this.attachEvents();
  }

  async attachEvents() {
    // pick the card we just added
  // get the container element once
  const containerEl = document.querySelector(this.container);
  if (!containerEl) {
    console.error(`Container ${this.container} not found`);
    return;
  }
  // look _inside_ the container for our specific card
  const root = containerEl.querySelector(
    `.node-card[data-key="${this.props.key}"]`
  );

    console.log('props:', `${this.container} .node-card[data-key="${this.props.key}"]`);
    console.log("root: ", root);
    
    const contentEl = root.querySelector('.node-card-content');

    const rawStats = await S.getLibInstance().get_stats();
    const rawPeerStats = await S.getLibInstance().get_peer_stats();
    const loading      = false; 

    // parse into objects
    let peerStats = { index_to_peers: {} };
    try { stats     = JSON.parse(rawStats);     } catch {}
    try { peerStats = JSON.parse(rawPeerStats); } catch {}
    const peers = Object.values(peerStats.index_to_peers || {});

    // build summary object
    const summary = {
      nodeType:      stats.node_type   || stats.type   || '—',
      blockHeight:   stats.block_height || stats.blockHeight || (stats.blockchain && stats.blockchain.head) || '—',
      walletVersion: (stats.wallet_version  && `${stats.wallet_version.major}.${stats.wallet_version.minor}.${stats.wallet_version.patch}`) || '—',
      coreVersion:   (stats.core_version    && `${stats.core_version.major}.${stats.core_version.minor}.${stats.core_version.patch}`) || '—',
      totalPeers:    peers.length,
      fullPeers:     peers.filter(p => p.static_peer_config?.synctype==='full').length,
      litePeers:     peers.filter(p => !p.static_peer_config || p.static_peer_config.synctype==='lite').length,
    };

    // helper to strip protocol
    const stripProto = url => url.replace(/^https?:\/\//, '');

    // render the body for whichever tab is active
    let activeTab = 'summary';
    const renderContent = () => {
      contentEl.innerHTML = '';
      if (loading) {
        contentEl.textContent = 'Loading…';
        return;
      }
      if (activeTab === 'summary') {
        contentEl.innerHTML = `
          <p><strong>Node type:</strong> ${summary.nodeType}</p>
          <p><strong>Attached peers:</strong> ${summary.totalPeers}</p>
          <p><strong>Full-node peers:</strong> ${summary.fullPeers}</p>
          <p><strong>Browser peers:</strong> ${summary.litePeers}</p>
          <p><strong>Block height:</strong> ${summary.blockHeight}</p>
          <p><strong>Wallet version:</strong> ${summary.walletVersion}</p>
          <p><strong>Core version:</strong> ${summary.coreVersion}</p>
        `;
      } else if (activeTab === 'peerStats') {
//        contentEl.innerHTML = `<pre class="peers json-view">${JSON.stringify(peers, null, 2)}</pre>`;


            let optjson = JSON.parse(
              JSON.stringify(
                peers,
                (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value // return everything else unchanged
              )
            );
            var tree = jsonTree.create(optjson, contentEl);

      } else if (activeTab === 'stats') {
        //contentEl.innerHTML = `<pre class="stats json-view">${JSON.stringify(stats, null, 2)}</pre>`;
          
          
            let optjson = JSON.parse(
              JSON.stringify(
                stats,
                (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value // return everything else unchanged
              )
            );
            var tree = jsonTree.create(optjson, contentEl);
          

      } else if (activeTab === 'peers') {
        const ul = document.createElement('ul');
        ul.className = 'peer-link-list';
        peers.forEach(p => {
          const url = `${p.static_peer_config.protocol}://${p.static_peer_config.host}${((p.static_peer_config.protocol==='http'&&p.static_peer_config.port!==80)||(p.static_peer_config.protocol==='https'&&p.static_peer_config.port!==443)) ? ':'+p.static_peer_config.port : ''}`;
          const li = document.createElement('li');
          li.className = 'peer-link-list-item';
          li.innerHTML = `
            <span class="peer-link">${stripProto(url)}</span>
            <a href="${url}" target="_blank" class="peer-link-external">↗</a>
          `;
          // in-app explore
          li.querySelector('.peer-link').addEventListener('click', () => {
            if (this.props.onExplore) this.props.onExplore(url);
          });
          ul.appendChild(li);
        });
        contentEl.innerHTML = '';
        contentEl.appendChild(ul);
      }
    }



    // hook up tab buttons
    root.querySelectorAll('.node-card-tab-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        // switch active class
        root.querySelectorAll('.node-card-tab-btn')
            .forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        // update tab
        activeTab = e.currentTarget.dataset.tab;
        renderContent();
      });
    });

    // close button
    root.querySelector('.node-card-close')
        .addEventListener('click', () => {
          if (this.props.onClose) this.props.onClose();
        });

    // initial paint
    renderContent();
  }
}

NodeCard._nextKey = 1;

module.exports = NodeCard;
