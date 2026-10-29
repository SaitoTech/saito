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
    this.show_add_form = false;
    this.saving_server = false;
    this.detail = null;
  }

  render() {
    this.error = '';
    this.notice = '';
    this.live = [];
    this.show_add_form = false;
    this.detail = null;

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
        loading_live: this.loading_live,
        show_add_form: this.show_add_form,
        detail: this.detail
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
    const protocol = endpoint.protocol || server.protocol || 'http';
    const host = endpoint.host || server.host || '';
    const port = endpoint.port || server.port || '';
    return {
      protocol: protocol === 'https' ? 'https' : 'http',
      host: String(host || ''),
      port: port === '' || port == null ? '' : String(port)
    };
  }

  peerKey(peer) {
    const host = String(peer.host || '').toLowerCase();
    if (host) {
      return `${host}|${String(peer.port || '')}`;
    }
    return `pk|${peer.publicKey || ''}`;
  }

  peerRows() {
    const liveByKey = new Map();
    for (const peer of this.live) {
      liveByKey.set(this.peerKey(peer), peer);
      if (peer.publicKey) {
        liveByKey.set(`pk|${peer.publicKey}`, peer);
      }
    }

    const rows = [];
    const seen = new Set();

    for (const peer of this.configured) {
      const key = this.peerKey(peer);
      seen.add(key);
      const live = liveByKey.get(key);
      rows.push({
        key,
        host: peer.host || '',
        port: peer.port || '',
        publicKey: live?.publicKey || '',
        verified: !!live?.publicKey,
        saved: true,
        detail: {
          ...(live || {}),
          host: peer.host || live?.host || '',
          port: peer.port || live?.port || '',
          protocol: peer.protocol || live?.protocol || '',
          synctype: peer.synctype || live?.synctype || '',
          publicKey: live?.publicKey || '',
          status: live?.status || '',
          saved: true
        }
      });
    }

    for (const peer of this.live) {
      const key = this.peerKey(peer);
      if (!peer.host && !peer.publicKey) {
        continue;
      }
      if (peer.host && seen.has(key)) {
        continue;
      }
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      rows.push({
        key,
        host: peer.host || '',
        port: peer.port || '',
        publicKey: peer.publicKey || '',
        verified: !!peer.publicKey,
        saved: false,
        detail: {
          ...peer,
          saved: false
        }
      });
    }

    return rows;
  }

  attachEvents() {
    const refreshBtn = document.getElementById('admin-peers-refresh');
    if (refreshBtn) {
      refreshBtn.onclick = () => this.loadLivePeers();
    }

    const updateBtn = document.getElementById('admin-server-update');
    if (updateBtn) {
      updateBtn.onclick = () => this.updateServerAddress();
    }

    const toggleAdd = document.getElementById('admin-peer-add-toggle');
    if (toggleAdd) {
      toggleAdd.onclick = () => {
        this.show_add_form = !this.show_add_form;
        this.refresh();
      };
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
      select.onclick = (e) => e.stopPropagation();
      select.onchange = (e) => {
        e.stopPropagation();
        this.setPeerSaved(select.getAttribute('data-peer-key'), select.value === 'saved');
      };
    });

    document.querySelectorAll('.admin-peer-row').forEach((row) => {
      row.onclick = () => this.showPeerDetail(row.getAttribute('data-peer-key'));
      row.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showPeerDetail(row.getAttribute('data-peer-key'));
        }
      };
    });

    const closeDetail = () => {
      this.detail = null;
      this.refresh();
    };
    const backdrop = document.getElementById('admin-peer-detail-close');
    if (backdrop) {
      backdrop.onclick = (e) => {
        if (e.target === backdrop) {
          closeDetail();
        }
      };
    }
    const dismiss = document.getElementById('admin-peer-detail-dismiss');
    if (dismiss) {
      dismiss.onclick = closeDetail;
    }
  }

  showPeerDetail(key) {
    const row = this.peerRows().find((peer) => peer.key === key);
    if (!row?.detail) {
      return;
    }
    this.detail = row.detail;
    this.refresh();
  }

  async updateServerAddress() {
    if (this.saving_server) return;

    const protocol = (document.getElementById('admin-server-protocol')?.value || '').trim();
    const host = (document.getElementById('admin-server-host')?.value || '').trim();
    const port = (document.getElementById('admin-server-port')?.value || '').trim();

    if (!host || !port || (protocol !== 'http' && protocol !== 'https')) {
      this.error = 'A protocol, host, and port are needed to update the server address.';
      this.notice = '';
      this.refresh();
      return;
    }

    this.saving_server = true;
    this.error = '';
    this.notice = '';

    const current = this.mod.server_info?.options?.server || {};
    const server = {
      ...current,
      host,
      port: Number(port) || port,
      protocol,
      endpoint: {
        ...(current.endpoint || {}),
        host,
        port: Number(port) || port,
        protocol
      }
    };

    try {
      let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
        this.mod.server_publickey
      );
      tx.msg = {
        module: 'Admin',
        request: 'update-options',
        data: { server }
      };
      await tx.sign();

      await this.app.network.sendTransactionWithCallback(
        tx,
        (res_tx) => {
          const res =
            typeof res_tx.returnMessage === 'function' ? res_tx.returnMessage() : res_tx;
          if (res?.err) {
            this.error = res.err;
            this.notice = '';
            this.refresh();
            return;
          }

          if (this.mod.server_info?.options) {
            this.mod.server_info.options.server = {
              ...(this.mod.server_info.options.server || {}),
              ...server
            };
          }
          this.notice = 'Server address saved.';
          this.error = '';
          this.refresh();
          if (typeof siteMessage === 'function') {
            siteMessage('Server address saved');
          }
        },
        this.mod.server_publickey
      );
    } catch (err) {
      this.error = err.message || String(err);
      this.notice = '';
      this.refresh();
    } finally {
      this.saving_server = false;
    }
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
    this.show_add_form = false;
    this.savePeers('add');
  }

  removePeer(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.configured.length) {
      return;
    }
    this.configured.splice(index, 1);
    this.savePeers('remove');
  }

  responseMessage(res_tx) {
    return typeof res_tx?.returnMessage === 'function' ? res_tx.returnMessage() : res_tx;
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
        let res = this.responseMessage(res_tx);
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
        let res = this.responseMessage(res_tx);
        if (res?.err) {
          this.error = res.err;
          this.live = [];
          this.refresh();
          return;
        }
        this.live = (res?.result || []).map((p) => ({
          publicKey: p.publicKey || '',
          host: p.host || '',
          port: p.port || '',
          protocol: p.protocol || '',
          synctype: p.synctype || '',
          status: p.status || '',
          id: p.id || ''
        }));
        this.refresh();
      },
      this.mod.server_publickey
    );
  }
}

module.exports = AdminPeersUI;
