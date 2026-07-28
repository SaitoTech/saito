const DashboardTemplate = require('./dashboard.template');
const { buildPeerNodeInfo } = require('../peer-node-info');
const { formatSaito } = require('../explorer-format');
const { summarizeModulePopularity } = require('../module-detect');

const MODULE_LIST_LIMIT = 6;

class Dashboard {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.container = null;
    this.fetchToken = 0;
    this.peerNode = {
      ready: false,
      loading: true,
      error: null
    };
  }

  render(container) {
    if (!container) {
      return;
    }

    this.container = container;
    this.paint();
    this.loadPeerNodeInfo();
  }

  paint() {
    if (!this.container) {
      return;
    }

    this.app.browser.replaceElementContentBySelector(
      DashboardTemplate({
        peerNode: this.peerNode,
        blockchain: this.buildBlockchainInfo(),
        modules: this.buildModulePopularity(),
        app: this.app
      }),
      this.container
    );
  }

  buildBlockchainInfo() {
    const info = this.mod.chainInfo;
    const ready = this.mod.chainInfoReady;
    const error = this.mod.chainInfoError;

    if (!info) {
      if (error) {
        return { loading: false, ready: false, error, rows: [] };
      }
      return { loading: !ready, ready: false, error: null, rows: [] };
    }

    const integer = (value) => (value == null ? '—' : Number(value).toLocaleString('en-US'));
    const saito = (value) => (value == null ? '—' : formatSaito(value));

    // The ATR (Automatic Transaction Rebroadcast) frontier block is the oldest
    // block still retained in the current epoch — i.e. the blockchain's
    // genesis_block_id — whose unspent slips are rebroadcast as it falls out of
    // the genesis window.
    const rows = [
      { label: 'Burn Fee', value: saito(info.burnfee) },
      { label: 'Difficulty', value: integer(info.difficulty) },
      { label: 'ATR Block', value: integer(info.genesis_block_id) },
      { label: 'Golden Ticket Coverage', value: this.formatGoldenTicketCoverage(info) }
    ];

    return { loading: false, ready: true, error: null, rows };
  }

  formatGoldenTicketCoverage(info) {
    const window = Number(info?.golden_ticket_window ?? 0);
    const count = Number(info?.golden_ticket_count ?? 0);
    if (!Number.isFinite(window) || window <= 0) {
      return '—';
    }
    const percent = Math.round((count / window) * 100);
    return `${percent}% (${count}/${window})`;
  }

  buildModulePopularity() {
    const ready = this.mod.transactionsReady;
    const error = this.mod.transactionsError;

    if (!ready) {
      return { loading: true, ready: false, error: null, rows: [], total: 0 };
    }

    const { rows, total } = summarizeModulePopularity(this.mod.transactions || [], {
      limit: MODULE_LIST_LIMIT
    });

    return { loading: false, ready: true, error: error || null, rows, total };
  }

  async loadPeerNodeInfo() {
    const token = ++this.fetchToken;

    if (!this.mod.explorerPeer?.publicKey) {
      this.peerNode = {
        ready: false,
        loading: false,
        error: null
      };
      this.paint();
      return;
    }

    this.peerNode = {
      ready: false,
      loading: true,
      error: null
    };
    this.paint();

    try {
      const info = await buildPeerNodeInfo(this.app, this.mod);
      if (token !== this.fetchToken) {
        return;
      }
      this.peerNode = info;
    } catch (err) {
      if (token !== this.fetchToken) {
        return;
      }
      console.error('Explorer: failed to load peer node info', err);
      this.peerNode = {
        ready: false,
        loading: false,
        error: 'Unable to load node information.'
      };
    }

    this.paint();
  }
}

module.exports = Dashboard;
