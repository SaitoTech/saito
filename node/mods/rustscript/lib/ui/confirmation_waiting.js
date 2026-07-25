/**
 * Live confirmation waiting UI — shared by publish and spend (unlock) flows.
 *
 * Countdown initial value: 2 × consensus heartbeat (blocks become producible at 2× heartbeat).
 * Countdown resets on each new block when the pending tx is not yet confirmed.
 */

const WIKI_URL = 'https://wiki.saito.io/docs/scripting';

const ROTATING_MESSAGES = [
  { type: 'text', text: 'please be patient...' },
  { type: 'text', text: 'almost there...' },
  { type: 'text', text: 'waiting for the next block...' },
  { type: 'text', text: 'did you know? nfts can be protected by scripts too.' },
  { type: 'wiki' },
  { type: 'text', text: 'scripts can protect games, collectibles, and identities.' },
  { type: 'text', text: 'the network is processing blocks continuously.' }
];

const MISSED_BLOCK_LINES = [
  'your transaction was not included in the last block.',
  'still monitoring and waiting for the next opportunity...'
];

/** Default from node/config/.template.options.conf when consensus options are unavailable. */
const DEFAULT_HEARTBEAT_MS = 30000;

function getHeartbeatMs(app) {
  const ms = app?.options?.consensus?.heartbeat_interval;
  if (Number.isFinite(ms) && ms > 0) {
    return ms;
  }
  return DEFAULT_HEARTBEAT_MS;
}

/** Seconds until the next block may be produced (2 × heartbeat). */
function getExpectedBlockSeconds(app) {
  return Math.round((2 * getHeartbeatMs(app)) / 1000);
}

/** Grace countdown when the target window has already elapsed since the last block. */
const GRACE_PERIOD_SECONDS = 30;

/**
 * Last confirmed block timestamp (ms) from persisted chain state.
 * Updated via Blockchain.saveBlockchain() on each onNewBlock.
 */
function getLastBlockTimestampMs(app) {
  return Number(app?.options?.blockchain?.last_timestamp || 0);
}

function getElapsedSinceLastBlockSeconds(app) {
  const lastTs = getLastBlockTimestampMs(app);
  if (!Number.isFinite(lastTs) || lastTs <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - lastTs) / 1000));
}

/**
 * Initial countdown: target − elapsed since last block.
 * Falls back to full target when chain timestamp is unavailable.
 * Uses grace period when elapsed already exceeds target.
 */
function getInitialCountdownSeconds(app) {
  const target = getExpectedBlockSeconds(app);
  const lastTs = getLastBlockTimestampMs(app);
  if (!Number.isFinite(lastTs) || lastTs <= 0) {
    return target;
  }
  const elapsed = getElapsedSinceLastBlockSeconds(app);
  const remaining = target - elapsed;
  if (remaining > 0) {
    return remaining;
  }
  return GRACE_PERIOD_SECONDS;
}

function randomRotationDelayMs() {
  return 5000 + Math.floor(Math.random() * 5001);
}

class ConfirmationWaitingUI {
  /**
   * @param {object} app
   * @param {string} rootSelector - pending waiting overlay root
   */
  constructor(app, rootSelector = '.rs-confirmation-waiting.is-pending') {
    this.app = app;
    this.rootSelector = rootSelector;
    this.countdown = 0;
    this.messageIndex = 0;
    this.missedBlockMode = false;
    this._countdownTimer = null;
    this._messageTimer = null;
    this._resumeRotationTimer = null;
  }

  start() {
    this.stop();
    this.missedBlockMode = false;
    this.messageIndex = 0;
    this.countdown = getInitialCountdownSeconds(this.app);
    this.renderCountdown();
    this.renderRotatingSubtitle();

    this._countdownTimer = setInterval(() => {
      this.countdown -= 1;
      this.renderCountdown();
    }, 1000);

    this._scheduleNextRotation();
  }

  stop() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    if (this._messageTimer) {
      clearTimeout(this._messageTimer);
      this._messageTimer = null;
    }
    if (this._resumeRotationTimer) {
      clearTimeout(this._resumeRotationTimer);
      this._resumeRotationTimer = null;
    }
  }

  /** Called when onNewBlock fires but the pending transaction was not confirmed. */
  onNewBlockWithoutConfirmation() {
    this.missedBlockMode = true;
    this.countdown = getExpectedBlockSeconds(this.app);
    this.renderCountdown();
    this.renderMissedBlockSubtitle();

    if (this._resumeRotationTimer) {
      clearTimeout(this._resumeRotationTimer);
    }
    this._resumeRotationTimer = setTimeout(() => {
      this.missedBlockMode = false;
      this.renderRotatingSubtitle();
      this._scheduleNextRotation();
    }, 10000);
  }

  _scheduleNextRotation() {
    if (this._messageTimer) {
      clearTimeout(this._messageTimer);
    }
    this._messageTimer = setTimeout(() => {
      if (!this.missedBlockMode) {
        this.messageIndex = (this.messageIndex + 1) % ROTATING_MESSAGES.length;
        this.renderRotatingSubtitle();
      }
      this._scheduleNextRotation();
    }, randomRotationDelayMs());
  }

  _root() {
    return document.querySelector(this.rootSelector);
  }

  renderCountdown() {
    const el = this._root()?.querySelector('.rs-confirmation-countdown');
    if (el) {
      el.textContent = String(this.countdown);
    }
  }

  renderRotatingSubtitle() {
    const el = this._root()?.querySelector('.rs-confirmation-subtitle');
    if (!el) {
      return;
    }
    const entry = ROTATING_MESSAGES[this.messageIndex];
    if (entry?.type === 'wiki') {
      el.innerHTML =
        'learn advanced scripting at the ' +
        `<a href="${WIKI_URL}" target="_blank" rel="noopener noreferrer" class="rs-confirmation-wiki-link">saito wiki</a>.`;
    } else {
      el.textContent = entry?.text || '';
    }
  }

  renderMissedBlockSubtitle() {
    const el = this._root()?.querySelector('.rs-confirmation-subtitle');
    if (!el) {
      return;
    }
    el.innerHTML = MISSED_BLOCK_LINES.map(
      (line) => `<span class="rs-confirmation-subtitle-line">${line}</span>`
    ).join('');
  }
}

module.exports = {
  WIKI_URL,
  ROTATING_MESSAGES,
  GRACE_PERIOD_SECONDS,
  getHeartbeatMs,
  getExpectedBlockSeconds,
  getLastBlockTimestampMs,
  getElapsedSinceLastBlockSeconds,
  getInitialCountdownSeconds,
  ConfirmationWaitingUI
};
