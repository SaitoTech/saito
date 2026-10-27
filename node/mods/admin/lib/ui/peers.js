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
        ...this.serverAddress(),
        peers: this.peerRows(),
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

  serverAddress() {
    const server = this.mod.server_info?.options?.server || {};
    const endpoint = server.endpoint || server;
    const protocol = endpoint.protocol || server.protocol || '';
    const host = endpoint.host || server.host || '';
    const port = endpoint.port || server.port || '';
    const url = protocol && host && port ? `${protocol}://${host}:${port}` : '';
    return {
      url,
      host: String(host || ''),
      port: port === '' || port == null ? '' : String(port)
    };
  }

  peerKey(peer) {
    return `${String(peer.host || '').toLowerCase()}|${String(peer.port || '')}`;
  }

  peerRows() {
    const liveByKey = new Map(this.live.map((peer) => [this.peerKey(peer), peer]));
    const rows = [];
    const seen = new Set();

    for (const peer of this.configured) {
      const key = this.peerKey(peer);
      seen.add(key);
      const live = liveByKey.get(key);
      rows.push({
        key,
        host: peer.host,
        port: peer.port,
        publicKey: live?.publicKey || '',
        verified: !!live?.publicKey,
        saved: true
      });
    }

    for (const peer of this.live) {
      const key = this.peerKey(peer);
      if (seen.has(key) || !peer.host) {
        continue;
      }
      rows.push({
        key,
        host: peer.host,
        port: peer.port,
        publicKey: peer.publicKey || '',
        verified: !!peer.publicKey,
        saved: false
      });
    }

    return rows;
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

    document.querySelectorAll('[data-peer-type]').forEach((select) => {
      select.onchange = () => {
        this.setPeerSaved(select.getAttribute('data-peer-key'), select.value === 'saved');
      };
    });
  }

  setPeerSaved(key, saved) {
    const index = this.configured.findIndex((peer) => this.peerKey(peer) === key);
    if (saved && index >= 0) {
      return;
    }
    if (!saved) {
      this.removePeer(index);
      return;
    }

    const live = this.live.find((peer) => this.peerKey(peer) === key);
    if (!live?.host || !live?.port) {
      this.error = 'That peer does not have a host and port to save.';
      this.notice = '';
      this.refresh();
      return;
    }

    const protocol = live.protocol === 'http' ? 'http' : 'https';
    this.configured.push({
      host: live.host,
      port: Number(live.port),
      protocol,
      synctype: live.synctype === 'lite' ? 'lite' : 'full'
    });
    this.savePeers('add');
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
