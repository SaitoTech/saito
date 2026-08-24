const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');
const WaitingTemplate = require('./waiting.template');

class Waiting {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);

    this.claimTimeoutMs = 120000;
    this.claimTimeoutId = null;
    this.claimCountdownIntervalId = null;
    this.dev_mode = 0;
    this.devUiSuccessTimerId = null;
  }

  render(data = {}) {
    this.clearMonitoring();
    this.mod.attachStyleSheets();

    if (data.timeout) {
      this.overlay.show(WaitingTemplate(this.app, this.mod, { timeout: true }), () => {
        this.clearMonitoring();
      });
      const closeBtn = document.querySelector('.waiting .saito-button-secondary');
      if (closeBtn) {
        closeBtn.onclick = () => {
          this.close();
        };
      }
      return;
    }

    this.overlay.show(WaitingTemplate(this.app, this.mod), () => {
      this.clearDevUiSuccessTimer();
      this.clearMonitoring();
    });
    this.startMonitoring();
    if (this.dev_mode) {
      this.startDevUiSuccessTimer();
    }
  }

  close() {
    this.clearMonitoring();
    this.overlay.close();
  }

  startMonitoring() {
    this.clearMonitoring();

    this.claimTimeoutId = setTimeout(() => {
      const root = document.querySelector('.waiting');
      if (root && !root.classList.contains('timeout')) {
        this.render({ timeout: true });
      }
    }, this.claimTimeoutMs);

    this.startBlockCountdown();
  }

  clearMonitoring() {
    if (this.claimTimeoutId) {
      clearTimeout(this.claimTimeoutId);
      this.claimTimeoutId = null;
    }
    this.stopBlockCountdown();
    this.clearDevUiSuccessTimer();
  }

  clearDevUiSuccessTimer() {
    if (this.devUiSuccessTimerId) {
      clearTimeout(this.devUiSuccessTimerId);
      this.devUiSuccessTimerId = null;
    }
  }

  startDevUiSuccessTimer() {
    this.clearDevUiSuccessTimer();
    this.devUiSuccessTimerId = setTimeout(() => {
      this.devUiSuccessTimerId = null;
      const root = document.querySelector('.waiting');
      if (!root || root.classList.contains('timeout')) {
        return;
      }
      this.close();
      this.mod.success_overlay.render({
        amountLabel: `${this.app.wallet.convertNolanToSaito(this.mod.amount)} SAITO`
      });
    }, 10000);
  }

  startBlockCountdown() {
    this.stopBlockCountdown();

    let heartbeatMs = Number(this.app?.options?.consensus?.heartbeat_interval);
    if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
      heartbeatMs = 30000;
    } else if (heartbeatMs < 1000) {
      heartbeatMs = Math.round(heartbeatMs * 1000);
    }
    const blockWindowSeconds = Math.max(1, Math.round((2 * heartbeatMs) / 1000));

    const lastTs = Number(this.app?.options?.blockchain?.last_timestamp || 0);
    let seconds = blockWindowSeconds;
    if (Number.isFinite(lastTs) && lastTs > 0) {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - lastTs) / 1000));
      const intoWindow = elapsedSec % blockWindowSeconds;
      if (!(elapsedSec > 0 && intoWindow === 0)) {
        seconds = blockWindowSeconds - intoWindow;
        if (seconds <= 0) {
          seconds = blockWindowSeconds;
        }
      }
    }

    const renderSeconds = () => {
      const el = document.querySelector('.waiting .countdown');
      if (el) {
        el.textContent = String(seconds);
      }
    };

    renderSeconds();

    this.claimCountdownIntervalId = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        seconds = blockWindowSeconds;
      }
      renderSeconds();
    }, 1000);
  }

  stopBlockCountdown() {
    if (this.claimCountdownIntervalId) {
      clearInterval(this.claimCountdownIntervalId);
      this.claimCountdownIntervalId = null;
    }
  }
}

module.exports = Waiting;
