const HoldersTemplate = require('./holders.template');
const { sendExplorerPeerRequest } = require('../peer/client');

function normalizePage(value) {
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : 1;
}

class Holders {
  constructor(app, mod, page = 1, snapshotId = null) {
    this.app = app;
    this.mod = mod;
    this.page = normalizePage(page);
    this.snapshotId = snapshotId;
    this.container = '.explorer-view';
    this.view = null;
    this.loading = false;
    this.error = null;
    this.expired = false;
    this.loadToken = 0;
    this.timer = null;
  }

  render(container = '') {
    if (container) this.container = container;
    this.load();
  }

  cleanup() {
    this.loadToken++;
    clearTimeout(this.timer);
  }

  load() {
    this.cleanup();
    const token = this.loadToken;
    this.loading = true;
    this.error = null;
    this.expired = false;
    this.paint();
    const peer = this.mod.explorerPeer;
    if (!peer) return; // onPeerServiceUp restarts this view once connected.

    let finished = false;
    const finish = (response) => {
      if (finished || token !== this.loadToken || this.mod.activeView !== 'holders') return;
      finished = true;
      clearTimeout(this.timer);
      this.loading = false;
      if (response?.err || !response?.success || !response?.data) {
        this.error = response?.error || 'Unable to load holders. Please retry.';
        this.expired = response?.code === 'SNAPSHOT_EXPIRED';
      } else {
        this.view = response.data;
        this.page = this.view.page;
        this.snapshotId = this.view.snapshot_id;
        window.history.replaceState(
          { view: 'holders', page: this.page, snapshotId: this.snapshotId },
          '',
          `/${this.mod.slug}/holders?page=${this.page}`
        );
      }
      this.paint();
    };

    this.timer = setTimeout(
      () => finish({ error: 'The holder request timed out. Please retry.' }),
      20_000
    );
    try {
      const request = sendExplorerPeerRequest(this.app, 'request holders', {
        data: { request: 'request holders', page: this.page, snapshot_id: this.snapshotId },
        peer,
        callback: finish
      });
      Promise.resolve(request).catch(() =>
        finish({ error: 'Unable to contact the Explorer peer. Please retry.' })
      );
    } catch (err) {
      finish({ error: 'Unable to contact the Explorer peer. Please retry.' });
    }
  }

  paint() {
    this.app.browser.replaceElementContentBySelector(
      HoldersTemplate(this.app, {
        view: this.view,
        loading: this.loading,
        waiting: !this.mod.explorerPeer,
        error: this.error,
        expired: this.expired
      }),
      this.container
    );
    const root = document.querySelector(this.container);
    if (!root) return;
    root.querySelectorAll('[data-holders-page]').forEach((button) => {
      button.onclick = () =>
        this.mod.renderHolders({
          page: Number(button.dataset.holdersPage),
          snapshotId: this.snapshotId,
          animate: false
        });
    });
    const refresh = root.querySelector('[data-holders-refresh]');
    if (refresh) refresh.onclick = () => this.mod.renderHolders({ page: 1, animate: false });
    const retry = root.querySelector('[data-holders-retry]');
    if (retry) retry.onclick = () => this.load();
  }
}

module.exports = Holders;
module.exports.normalizePage = normalizePage;
