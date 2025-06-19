const NodeCardTemplate = require('./node-card.template');
const S = require('saito-js/saito').default;
const jsonTree = require('json-tree-viewer');

class NodeCard {
  /**
   * props = { title, endpoint?, onExplore, onClose }
   */
  constructor(app, mod, props) {
    this.app = app;
    this.mod = mod;
    this.props = { ...props };
    this.container = '#status-container';
    this.root = null;
    this.contentEl = null;
    this.stats = {};
    this.peers = [];
    this.congestion = {};
  }

  async render() {
    // Insert template and capture our root element
    const html = NodeCardTemplate(this.app, this.mod, {
      title: this.props.title
    });
    this.app.browser.addElementToSelector(html, this.container);

    // Our root is the last appended node-card
    const containerEl = document.querySelector(this.container);
    this.root = containerEl.lastElementChild;
    this.contentEl = this.root.querySelector('.node-card-content');

    this.hookTabButtons();
    this.hookCloseButton();

    // Initial load and render content
    await this.loadData();
  }

  async loadData() {
    if (!this.contentEl) return;
    try {
        const [statsRaw, peerRaw, congestionRaw] = await Promise.all([
          this.fetchData('stats'),
          this.fetchData('stats/peers'),
          this.fetchData('stats/congestion'),
        ]);
        
        this.stats = this.safeParse(statsRaw);
        this.peers = Object.values(
          this.safeParse(peerRaw, { index_to_peers: {} }).index_to_peers
        );
        this.congestion = this.safeParse(congestionRaw);
   
        console.log("congestion: ", this.congestion);

    } catch (e) {
      console.error('Error loading data:', e);
      this.contentEl.textContent = 'Error loading data';
      return;
    }

    // Render content based on active tab
    this.renderContent();
  }

  fetchData(path) {
    if (this.props.endpoint) {
      return fetch(`${this.props.endpoint}/${path}`).then(r => r.text());
    }
    // fallback to local stats
    return path.includes('peers')
      ? S.getLibInstance().get_peer_stats()
      : S.getLibInstance().get_stats();
  }

  safeParse(data, fallback = {}) {
    try {
      return JSON.parse(data);
    } catch {
      return fallback;
    }
  }


  buildSummary() {
    const stats = this.stats;
    const peers = this.peers;

    const state     = stats.current_wallet_state || {};
    const coreObj   = state.core_version   || {};
    const walletObj = state.wallet_version || {};

    const fmtVersion = v => (
      typeof v.major === 'number' &&
      typeof v.minor === 'number' &&
      typeof v.patch === 'number'
        ? `${v.major}.${v.minor}.${v.patch}`
        : '—'
    );

    let nodeType = 'lite';
    if (this.props.config && Object.keys(this.props.config).length > 0) {
      const url = this.props.config.block_fetch_url;
      nodeType = (url && url !== '') ? 'full' : 'lite';
    }

    const summary = {
      nodeType,
      blockHeight   : stats?.current_blockchain_state?.longest_chain_length ?? '—',
      walletVersion : fmtVersion(walletObj),
      coreVersion   : fmtVersion(coreObj),
    };

    if (Object.keys(this.props.options).length > 0) {
      summary.nodeType      = nodeType;
      summary.blockHeight   = this.props.options.blockchain.last_block_id;
      summary.walletVersion = this.props.options.wallet.version;
      summary.coreVersion =  '—';

      // const firstFull = peers.find(p => p.block_fetch_url && p.block_fetch_url !== '');
      // summary.coreVersion = firstFull
      //   ? fmtVersion(firstFull.core_version || {})
      //   : '—';
    }

    if (Object.keys(this.props.config).length > 0) {
      summary.walletVersion = fmtVersion(this.props.config.wallet_version);
      summary.coreVersion = fmtVersion(this.props.config.core_version);
    }

    return `
      <div class="summary-tab">
        <p><strong>Node type:</strong> <span>${summary.nodeType}</span></p>
        <p><strong>Number of attached peers:</strong> <span>${peers.length}</span></p>
        <p><strong>Number of full node peers:</strong>
           <span>${peers.filter(p => p.block_fetch_url && p.block_fetch_url !== '').length}</span>
        </p>
        <p><strong>Number of browser peers:</strong>
           <span>${peers.filter(p => !p.block_fetch_url).length}</span>
        </p>
        <p><strong>Block Height:</strong> <span>${summary.blockHeight}</span></p>
        <p><strong>Wallet version:</strong> <span>${summary.walletVersion}</span></p>
        <p><strong>Core version:</strong>  <span>${summary.coreVersion}</span></p>
      </div>
    `;
  }


  renderContent() {
    if (!this.contentEl || !this.root) return;
    this.contentEl.innerHTML = '';
    const activeTab = this.root.querySelector('.node-card-tab-btn.active')
      .dataset.tab;

    console.log("node-card options: ", this.props.options);
    console.log("node-card configs: ", this.props.config);

    let ip = '';
    let pubkey = '';
    if (Object.keys(this.props.options).length > 0) {
      ip = `(${window.location.host})`;
      pubkey = this.props.options.wallet.publicKey;

      this.root.querySelector('.node-card-info .ip').innerHTML = ip;
      this.root.querySelector(`.node-card-menu .monitors`).style.display = 'none';
    } else {
      if (this.props.config) {
        let config = this.props.config;

        ip = config.ip_address;
        pubkey = config.public_key;
      }
    }

    this.root.querySelector('.node-card-info .pubkey').innerHTML = pubkey;
    this.contentEl.setAttribute('data-key', pubkey);

    if (activeTab === 'summary') {

      let summaryHtml = this.buildSummary();
      this.contentEl.innerHTML = summaryHtml;
    
    } else if (activeTab === 'peerStats') {
    
      jsonTree.create(this.peers, this.contentEl);
    
    } else if (activeTab === 'stats') {
    
      jsonTree.create(this.stats, this.contentEl);
    
    } else if (activeTab === 'monitors') {

      jsonTree.create(this.congestion, this.contentEl);

    } else if (activeTab === 'peers') {
      console.log("this.peers:", this.peers);
      this.peers.forEach(p => {
        this.contentEl.appendChild(this.makePeerLink(p));
      });
    }
  }

  makePeerLink(peer) {
    let this_self = this;
    console.log("make peer link");
    console.log("peer: ", peer);
    let url = '';
   const el = document.createElement('div');

    let block_fetch_url = peer.block_fetch_url;

    if (
      block_fetch_url == ""
    ) {
      url = `
        <div class="peer-link-info">
          <div class="peer-title-container">
            <span class="peer-title">Browser</span>            
            <span class="peer-ip">(${peer.ip_address})</span>
          </div>
          <div class="perr-pubkey">${peer.public_key}</div>
        </div>
      `

      el.className = 'peer-item browser';
      el.innerHTML = `<span>${url}</span>`;
    } else {
      url = `${peer.static_peer_config.protocol}://${peer.static_peer_config.host}`;
      if (
        (peer.static_peer_config.protocol === 'https' && peer.static_peer_config.port !== 443) ||
        (peer.static_peer_config.protocol === 'http'  && peer.static_peer_config.port !== 80)
      ) {
        url += `:${peer.static_peer_config.port}`;
      }

      el.className = 'peer-item';
      el.innerHTML = `<span>${url}</span><i>↗</i>`;
    } 

    el.onclick = () => {
      if (!el.classList.contains('browser')) {

        document.querySelectorAll(`.node-card-content[data-key="${peer.public_key}"]`).forEach(match => {
          const parent = match.parentElement;
          if (parent) parent.remove();
        });

        this_self.props.onExplore(url, peer);
      }
    }
    return el;
  }

  hookTabButtons() {
    this.root.querySelectorAll('.node-card-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.root
          .querySelectorAll('.node-card-tab-btn')
          .forEach(b => b.classList.toggle('active', b === btn));
        this.renderContent();
      });
    });
  }

  hookCloseButton() {
    const btn = this.root.querySelector('.node-card-close');
    btn.addEventListener('click', () => this.props.onClose?.());
  }

  remove() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }
}

module.exports = NodeCard;
