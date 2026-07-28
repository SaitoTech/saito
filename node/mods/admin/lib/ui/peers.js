const PeersTemplate = require('./peers.template');

class AdminPeers {
  constructor(app, mod, container = '.admin-peers') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.peers = JSON.parse(JSON.stringify(mod?.server_info?.options?.peers || []));
    this.livePeerJsonKeydown = null;
  }

  render() {
    this.app.browser.replaceElementBySelector(PeersTemplate(this.mod), this.container);

    this.attachEvents();
    this.attachLivePeerEvents();
    this.loadLivePeers();
  }

  markDirty() {
    document.getElementById('save-peers')?.removeAttribute('disabled');
  }

  attachEvents() {
    //
    // Remove peer
    //
    document.querySelectorAll('.peer-remove').forEach((btn) => {
      btn.onclick = (e) => {
        const row = e.currentTarget.closest('.peer-row');
        const idx = parseInt(row.dataset.index, 10);
        this.peers.splice(idx, 1);
        this.markDirty();
        this.render();
      };
    });

    //
    // Add peer
    //
    const addBtn = document.getElementById('add-peer-btn');
    if (addBtn) {
      addBtn.onclick = () => {
        const host = document.getElementById('peer-host').value.trim();
        const port = parseInt(document.getElementById('peer-port').value, 10);
        const protocol = document.getElementById('peer-protocol').value;
        const publicKey = document.getElementById('peer-key').value.trim();

        if (!host || !port || !protocol) {
          salert('Host, port, and protocol are required.');
          return;
        }

        this.peers.push({
          host,
          port,
          protocol,
          publicKey,
          synctype: 'lite'
        });

        this.markDirty();
        this.render();
      };
    }

    //
    // Save peers
    //
    const saveBtn = document.getElementById('save-peers');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        saveBtn.textContent = 'Saving…';
        saveBtn.setAttribute('disabled', true);

        let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
          this.mod.server_publickey
        );

        tx.msg = {
          module: 'Admin',
          request: 'update-options',
          data: {
            peers: this.peers
          }
        };

        await tx.sign();

        this.app.network.sendTransactionWithCallback(
          tx,
          (res_tx) => {
            let res = res_tx.returnMessage();
            if (res?.err) {
              salert(res.err);
              saveBtn.removeAttribute('disabled');
              saveBtn.textContent = 'Save Changes';
            } else {
              siteMessage('Peers updated');
              reloadWindow(1200);
            }
          },
          this.mod.server_publickey
        );
      };
    }
  }

  attachLivePeerEvents() {
    const btn = document.getElementById('refresh-live-peers-button');
    if (!btn) return;

    btn.onclick = async () => {
      btn.disabled = true;
      btn.innerText = 'Loading...';
      await this.loadLivePeers();
      btn.disabled = false;
      btn.innerText = 'Refresh Live Peers';
    };
  }

  async loadLivePeers() {
    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.mod.server_publickey
    );

    tx.msg = {
      module: 'Admin',
      request: 'list-peers',
      data: {}
    };

    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => {
        let res = res_tx.returnMessage();

        if (res?.err) {
          this.renderLivePeerError(res.err);
        } else {
          this.renderLivePeersTable(res.result || []);
        }
      },
      this.mod.server_publickey
    );
  }

  renderLivePeersTable(rows) {
    const container = document.getElementById('admin-live-peers-output');
    if (!container) return;

    container.innerHTML = '';

    if (!rows || rows.length === 0) {
      container.innerHTML = '<em>No peers currently connected.</em>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-live-peers-table';

    // Dynamically determine all keys present across rows
    const hiddenKeys = new Set(['peer']);
    const allKeys = new Set();
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!hiddenKeys.has(key)) {
          allKeys.add(key);
        }
      });
    });

    const keys = Array.from(allKeys);

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    keys.forEach((key) => {
      const th = document.createElement('th');
      th.innerText = key;
      headerRow.appendChild(th);
    });

    const actionHeader = document.createElement('th');
    actionHeader.innerText = 'JSON';
    headerRow.appendChild(actionHeader);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');

    rows.forEach((row) => {
      const tr = document.createElement('tr');

      keys.forEach((key) => {
        const td = document.createElement('td');

        const value = row[key];

        if (typeof value === 'object' && value !== null) {
          td.innerText = JSON.stringify(value);
        } else {
          td.innerText = value !== undefined && value !== null ? value : '-';
        }

        tr.appendChild(td);
      });

      const actionTd = document.createElement('td');
      const jsonButton = document.createElement('button');
      jsonButton.className = 'admin-live-peer-json-button';
      jsonButton.type = 'button';
      jsonButton.innerText = 'View';
      jsonButton.onclick = () => {
        this.showLivePeerJson(row.peer || row);
      };
      actionTd.appendChild(jsonButton);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  showLivePeerJson(peer) {
    this.closeLivePeerJson();

    const overlay = document.createElement('div');
    overlay.className = 'admin-live-peer-json-overlay';

    const popup = document.createElement('div');
    popup.className = 'admin-live-peer-json-popup';

    const header = document.createElement('div');
    header.className = 'admin-live-peer-json-header';

    const title = document.createElement('h3');
    title.innerText = 'Peer JSON';

    const closeButton = document.createElement('button');
    closeButton.className = 'admin-live-peer-json-close';
    closeButton.type = 'button';
    closeButton.innerText = 'Close';

    header.appendChild(title);
    header.appendChild(closeButton);

    const json = document.createElement('pre');
    json.className = 'admin-live-peer-json-body';
    try {
      json.innerText = JSON.stringify(peer, null, 2) || '{}';
    } catch (err) {
      json.innerText = `Unable to stringify peer JSON: ${err.message}`;
    }

    popup.appendChild(header);
    popup.appendChild(json);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    const close = () => {
      this.closeLivePeerJson();
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    closeButton.onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        close();
      }
    };
    document.addEventListener('keydown', onKeydown);
    this.livePeerJsonKeydown = onKeydown;
  }

  closeLivePeerJson() {
    if (this.livePeerJsonKeydown) {
      document.removeEventListener('keydown', this.livePeerJsonKeydown);
      this.livePeerJsonKeydown = null;
    }
    document.querySelector('.admin-live-peer-json-overlay')?.remove();
  }

  renderLivePeerError(msg) {
    const container = document.getElementById('admin-live-peers-output');
    if (!container) return;
    container.innerHTML = `<div class="admin-live-peer-error">${msg}</div>`;
  }
}

module.exports = AdminPeers;
