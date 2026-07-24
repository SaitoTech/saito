const FileInfoTemplate = require('./file-info.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class FileInfo {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.sig = '';
    this.nft_id = '';
    this._countdownInterval = null;
    this._onWalletUpdated = null;
  }

  async render() {
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
    if (this._onWalletUpdated) {
      this.app.connection.off('wallet-updated', this._onWalletUpdated);
      this._onWalletUpdated = null;
    }

    this.overlay.show(FileInfoTemplate(this.app, this.mod, this), () => {
      if (this._countdownInterval) {
        clearInterval(this._countdownInterval);
        this._countdownInterval = null;
      }
      if (this._onWalletUpdated) {
        this.app.connection.off('wallet-updated', this._onWalletUpdated);
        this._onWalletUpdated = null;
      }
    });

    // Same approach as RustScript confirmation waiting: 2 × heartbeat + short buffer.
    let heartbeatMs = Number(this.app?.options?.consensus?.heartbeat_interval);
    if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
      heartbeatMs = 30000;
    }
    const cycleSeconds = Math.round((2 * heartbeatMs) / 1000) + 2;
    let seconds = cycleSeconds;

    const countdownEl = document.querySelector('#vault-file-info-countdown');
    const statusEl = document.querySelector('#vault-file-info-status');
    if (countdownEl) {
      countdownEl.textContent = String(seconds);
    }

    const showCompleted = () => {
      if (this._countdownInterval) {
        clearInterval(this._countdownInterval);
        this._countdownInterval = null;
      }
      if (this._onWalletUpdated) {
        this.app.connection.off('wallet-updated', this._onWalletUpdated);
        this._onWalletUpdated = null;
      }

      const waiting = document.querySelector('.vault-file-info-waiting');
      const success = document.querySelector('.vault-file-info-success');

      if (waiting) {
        waiting.style.display = 'none';
      }

      if (success) {
        success.style.display = 'flex';
        requestAnimationFrame(() => {
          success.style.transition = 'opacity 400ms ease';
          success.style.opacity = 1;
        });
      }

      this.attachEvents();
    };

    const nftInWallet = () => {
      if (!this.nft_id) {
        return false;
      }
      const nfts = this.app.options?.wallet?.nfts || [];
      for (let i = 0; i < nfts.length; i++) {
        if (nfts[i]?.id === this.nft_id) {
          return true;
        }
      }
      return false;
    };

    try {
      await this.app.wallet.updateNFTList();
    } catch (err) {}

    if (nftInWallet()) {
      showCompleted();
      return;
    }

    this._countdownInterval = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        if (statusEl) {
          statusEl.textContent = 'Waiting for the next block...';
        }
        seconds = cycleSeconds;
      }
      if (countdownEl) {
        countdownEl.textContent = String(seconds);
      }
    }, 1000);

    this._onWalletUpdated = () => {
      // Wallet owns updateNFTList on wallet-updated; only inspect synced options here.
      if (nftInWallet()) {
        showCompleted();
      }
    };
    this.app.connection.on('wallet-updated', this._onWalletUpdated);
  }

  attachEvents() {
    try {
      if (document.getElementById('open-vault')) {
        document.getElementById('open-vault').onclick = (e) => {
          this.overlay.close();
          this.app.connection.emit('vault-file-access-render');
        };
      }
    } catch (err) {}
  }
}

module.exports = FileInfo;
