const PeersTemplate = require('./peers.template');

class AdminPeersUI {
  constructor(app, mod, container = '.admin-peers') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.configured = [];
    this.live = [];
    this.error = '';
    this.notice = '';
    this.loading_live = false;
  }

  render() {
    this.error = '';
    this.notice = '';
    this.live = [];

    if (!this.mod.server_info) {
      this.app.browser.replaceElementContentBySelector(
        `<p class="admin-peers-empty">Waiting for the server to finish authenticating this administrator.</p>`,
        this.container
      );
      return;
    }

    this.configured = this.copyPeers(this.mod.server_info?.options?.peers || []);
    this.refresh();
    this.loadLivePeers();
  }

  refresh() {
    this.app.browser.replaceElementContentBySelector(
      PeersTemplate({
        endpoint: this.serverEndpoint(),
        public_key: this.mod.server_publickey || '',
        live: this.live,
        offline: this.offlineConfigured(),
        error: this.error,
        notice: this.notice,
        loading_live: this.loading_live
      }),
      this.container
    );
    this.attachEvents();
  }

  copyPeers(peers) {
    return (peers || []).map((p) => ({
      host: p.host || '',
      port: p.port,
      protocol: p.protocol || 'https',
      synctype: p.synctype || 'full'
    }));
  }

  serverEndpoint() {
    const server = this.mod.server_info?.options?.server || {};
    const endpoint = server.endpoint || server;
    const protocol = endpoint.protocol || server.protocol || '';
    const host = endpoint.host || server.host || '';
    const port = endpoint.port || server.port || '';
    if (!protocol || !host || !port) {
      return '';
    }
    return `${protocol}://${host}:${port}`;
  }

  peerKey(peer) {
    return `${String(peer.host || '').toLowerCase()}|${String(peer.port || '')}`;
  }

  offlineConfigured() {
    const live_keys = new Set(this.live.map((p) => this.peerKey(p)));
    return this.configured
      .map((p, index) => ({ ...p, index }))
      .filter((p) => !live_keys.has(this.peerKey(p)));
  }

  attachEvents() {
    document.querySelectorAll('.admin-copy-cmd').forEach((btn) => {
      btn.onclick = () => {
        const cmd = btn.dataset.cmd;
        if (!cmd) {
          return;
        }
        navigator.clipboard.writeText(cmd).then(() => {
          if (typeof siteMessage === 'function') {
            siteMessage('copied to clipboard...', 2000);
          }
        });
      };
    });

    const refreshBtn = document.getElementById('admin-peers-refresh');
    if (refreshBtn) {
      refreshBtn.onclick = () => this.loadLivePeers();
    }

    const addBtn = document.getElementById('admin-peer-add');
    if (addBtn) {
      addBtn.onclick = () => this.addPeer();
    }

    const hostInput = document.getElementById('admin-peer-host');
    if (hostInput) {
      hostInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          this.addPeer();
        }
      };
    }

    document.querySelectorAll('.admin-peer-remove').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.removePeer(idx);
      };
    });
  }

  addPeer() {
    const hostInput = document.getElementById('admin-peer-host');
    const portInput = document.getElementById('admin-peer-port');
    const protocolInput = document.getElementById('admin-peer-protocol');

    let host = (hostInput?.value || '').trim();
    let port = (portInput?.value || '').trim();
    let protocol = (protocolInput?.value || 'https').trim();

    if (host.includes('://')) {
      try {
        const url = new URL(host);
        protocol = url.protocol.replace(':', '') || protocol;
        host = url.hostname;
        if (url.port) {
          port = url.port;
        }
      } catch (err) {
        this.error = 'That does not look like a valid peer address.';
        this.notice = '';
        this.refresh();
        return;
      }
    }

    if (protocol === 'http' && !port) {
      port = '12101';
    }
    if (protocol === 'https' && !port) {
      port = '443';
    }

    if (!host || !port || (protocol !== 'http' && protocol !== 'https')) {
      this.error = 'A host, port, and protocol are needed to add a permanent peer.';
      this.notice = '';
      this.refresh();
      return;
    }

    const peer = {
      host,
      port: Number(port),
      protocol,
      synctype: 'full'
    };

    if (this.configured.some((p) => this.peerKey(p) === this.peerKey(peer))) {
      this.error = 'That peer is already in the permanent list.';
      this.notice = '';
      this.refresh();
      return;
    }

    this.configured.push(peer);
    this.savePeers('add');
  }

  removePeer(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.configured.length) {
      return;
    }
    this.configured.splice(index, 1);
    this.savePeers('remove');
  }

  async savePeers(action) {
    this.error = '';
    this.notice = '';
    this.refresh();

    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.mod.server_publickey
    );
    tx.msg = {
      module: 'Admin',
      request: 'update-peers',
      peers: this.configured
    };
    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => {
        let res = res_tx.returnMessage();
        if (res?.err) {
          this.configured = this.copyPeers(this.mod.server_info?.options?.peers || []);
          this.error = res.err;
          this.notice = '';
          this.refresh();
          return;
        }

        if (this.mod.server_info?.options) {
          this.mod.server_info.options.peers = this.copyPeers(this.configured);
        }

        if (action === 'add' && res?.connecting) {
          this.notice =
            'This peer is now in the server configuration, and Saito is attempting to connect to it. If it does not appear above, use Refresh. The connection is kept across restarts.';
        } else if (action === 'add') {
          this.notice =
            'This peer is now in the server configuration. Saito will attempt to connect to it the next time the server starts.';
        } else {
          this.notice =
            'This peer has been removed from the server configuration. If it is still connected, that connection will remain until it drops or Saito restarts.';
        }

        this.refresh();
        this.loadLivePeers();
        if (typeof siteMessage === 'function') {
          siteMessage('Peer configuration saved');
        }
      },
      this.mod.server_publickey
    );
  }

  async loadLivePeers() {
    this.loading_live = true;
    this.refresh();

    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.mod.server_publickey
    );
    tx.msg = {
      module: 'Admin',
      request: 'list-peers'
    };
    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => {
        this.loading_live = false;
        let res = res_tx.returnMessage();
        if (res?.err) {
          this.error = res.err;
          this.live = [];
          this.refresh();
          return;
        }
        this.live = (res.result || []).map((p) => {
          const configured_index = this.configured.findIndex(
            (c) => this.peerKey(c) === this.peerKey(p)
          );
          return {
            publicKey: p.publicKey || '',
            host: p.host || '',
            port: p.port || '',
            protocol: p.protocol || '',
            synctype: p.synctype || '',
            status: p.status || '',
            permanent: configured_index >= 0,
            configured_index
          };
        });
        this.refresh();
      },
      this.mod.server_publickey
    );
  }
}

module.exports = AdminPeersUI;
