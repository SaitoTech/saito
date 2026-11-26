const RecordingCapture = require('./recording-capture');
const downloadRecording = require('./recording-download');
const RecordingOptions = require('./ui/overlays/recording.template');
const SaitoOverlay = require('../../../lib/saito/ui/saito-overlay/saito-overlay');

class CallRecorder {
  constructor(mod) {
    this.mod = mod;
    this.app = mod.app;
    this.overlay = new SaitoOverlay(this.app, mod);
    this.remote = new Set();
    this.versions = new Map();
    this.countdowns = new Map();
    this.version = 0;
  }

  bind(button) {
    this.button = button;
    button.onclick = () => this.toggle();
    if (button.tagName !== 'BUTTON') {
      button.setAttribute('role', 'button');
      button.tabIndex = 0;
      button.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.toggle();
        }
      };
    }
    this.updateControl();
  }

  updateControl() {
    const button = this.button;
    if (!button) return;
    const local = this.recorder?.state === 'recording';
    const saving = !!this.saving && !this.capture;
    const peers = Array.from(this.remote, (peer) => this.app.keychain.returnUsername(peer));
    let label = peers.length ? 'Recording' : 'Record';
    let title = 'Record the call';
    if (local) {
      label = 'Stop';
      title = 'Stop recording';
    } else if (this.capture) {
      label = 'Cancel';
      title = 'Cancel count-in';
    } else if (saving) {
      label = 'Saving';
      title = 'Saving recording';
    }
    if (peers.length) title += ' (' + peers.join(', ') + ' recording)';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-pressed', String(local));
    button.setAttribute('aria-disabled', String(saving));
    const active = local || peers.length > 0;
    button.classList.toggle('recording', active);
    const text = button.querySelector('label');
    if (text) text.textContent = label;
    button
      .closest('.videocall-full')
      ?.querySelector('.video-container-large')
      ?.classList.toggle('videocall-recording-border', active);
  }

  toggle() {
    if (this.capture) return this.stop();
    if (this.saving || !this.mod.streams?.active) return;
    if (typeof MediaRecorder !== 'function') {
      siteMessage('This browser does not support call recording', 2500);
      return;
    }
    this.overlay.show(RecordingOptions());
    for (const option of document.querySelectorAll('.videocall-recording-options button')) {
      option.onclick = () => {
        this.overlay.close();
        this.prepare(option.dataset.mode === 'video');
      };
    }
  }

  prepare(video) {
    if (this.capture || this.saving || !this.mod.streams?.active) return;
    try {
      this.capture = new RecordingCapture(this.mod);
      const stream = this.capture.start(video);
      const mimeType = video ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus';
      const recorder = MediaRecorder.isTypeSupported(mimeType)
        ? new MediaRecorder(stream, {
            mimeType,
            audioBitsPerSecond: 327680,
            ...(video && { videoBitsPerSecond: 1572864 })
          })
        : new MediaRecorder(stream);
      this.recorder = recorder;
      const chunks = [];
      recorder.ondataavailable = ({ data }) => {
        if (data.size) chunks.push(data);
      };
      recorder.onstop = async () => {
        this.release();
        try {
          if (chunks.length) {
            await downloadRecording(
              new Blob(chunks, { type: recorder.mimeType || chunks[0].type }),
              video
            );
          } else {
            siteMessage('The recording contains no media', 2500);
          }
        } catch (err) {
          this.report(err);
        } finally {
          this.finishSave();
          this.saving = null;
          this.updateControl();
        }
      };
      recorder.onerror = (event) => this.report(event.error);
      this.signal('countdown');
      this.countdown(this.mod.publicKey, 5, () => {
        try {
          recorder.start(1000);
          this.saving = new Promise((resolve) => {
            this.finishSave = resolve;
          });
          this.signal('start');
          this.updateControl();
        } catch (error) {
          this.release();
          this.report(error);
        }
      });
      this.updateControl();
    } catch (error) {
      this.release();
      this.report(error);
    }
  }

  report(error) {
    console.error('Call recording failed', error);
    siteMessage('Could not complete the call recording', 3000);
  }

  stop() {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
    // Notify immediately. The browser delivers the final chunk and stop event later.
    this.release();
    return this.saving;
  }

  release() {
    if (!this.capture) return;
    this.clearCountdown(this.mod.publicKey);
    this.capture.stop();
    this.capture = null;
    if (this.recorder) this.signal('stop');
    this.recorder = null;
    this.updateControl();
  }

  close() {
    if (this.overlay.visible) this.overlay.close();
    this.remote.clear();
    for (const peer of this.countdowns.keys()) this.clearCountdown(peer);
    this.updateControl();
    return this.stop();
  }

  countdown(peer, seconds, done) {
    this.clearCountdown(peer);
    const el = document.createElement('div');
    el.className = 'videocall-recording-countdown';
    el.setAttribute('role', 'status');
    const name =
      peer === this.mod.publicKey
        ? 'Recording starts in'
        : this.app.keychain.returnUsername(peer) + ' starts recording in';
    const ends = Date.now() + seconds * 1000;
    const tick = () => {
      const left = Math.ceil((ends - Date.now()) / 1000);
      if (left > 0) {
        el.textContent = name + ' ' + left;
      } else {
        this.clearCountdown(peer);
        done?.();
      }
    };
    document.body.appendChild(el);
    this.countdowns.set(peer, { el, ends, timer: setInterval(tick, 200) });
    tick();
  }

  clearCountdown(peer) {
    const countdown = this.countdowns.get(peer);
    if (!countdown) return;
    clearInterval(countdown.timer);
    countdown.el.remove();
    this.countdowns.delete(peer);
  }

  peerJoined(peer) {
    if (this.recorder?.state === 'recording') this.signal('start', [peer], true);
    else if (this.countdowns.has(this.mod.publicKey)) this.signal('countdown', [peer]);
  }

  peerLeft(peer) {
    this.clearCountdown(peer);
    this.remote.delete(peer);
    this.updateControl();
  }

  async signal(phase, recipients = this.mod.room_obj?.call_peers, ongoing = false) {
    const peers = (recipients || []).filter((key) => key !== this.mod.publicKey);
    const call_id = this.mod.room_obj?.call_id;
    if (!peers.length || !call_id) return;
    this.version = Math.max(Date.now(), this.version + 1);
    const data = { phase, version: this.version, ongoing };
    if (phase === 'countdown') {
      const ends = this.countdowns.get(this.mod.publicKey)?.ends || Date.now() + 5000;
      data.seconds = Math.max(1, Math.ceil((ends - Date.now()) / 1000));
    }
    try {
      const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
      peers.forEach((key) => tx.addTo(key));
      tx.msg = { module: 'Videocall', request: 'call-recording', call_id, data };
      await tx.sign();
      this.app.connection.emit('relay-transaction', tx);
      if (phase !== 'countdown') await this.app.network.propagateTransaction(tx);
    } catch (err) {
      console.error('Could not send call recording notification', err);
    }
  }

  receive(tx) {
    const { call_id, data } = tx.returnMessage();
    const peer = tx.from[0].publicKey;
    if (
      !this.mod.streams?.active ||
      this.mod.room_obj?.call_id !== call_id ||
      !this.mod.room_obj.call_peers.includes(peer) ||
      !tx.isTo(this.mod.publicKey) ||
      !Number.isSafeInteger(data?.version) ||
      data.version <= (this.versions.get(peer) || 0) ||
      !['countdown', 'start', 'stop'].includes(data.phase)
    )
      return;
    this.versions.set(peer, data.version);
    this.clearCountdown(peer);
    if (data.phase === 'countdown') {
      this.countdown(peer, Math.min(5, Math.max(1, Number(data.seconds) || 5)));
      return;
    }
    const name = this.app.browser.escapeHTML(this.app.keychain.returnUsername(peer));
    if (data.phase === 'start') {
      this.remote.add(peer);
      siteMessage(
        name + (data.ongoing ? ' is recording this call' : ' started recording this call'),
        2500
      );
    } else if (this.remote.delete(peer)) {
      siteMessage(name + ' stopped recording this call', 2500);
    }
    this.updateControl();
  }
}

module.exports = CallRecorder;
