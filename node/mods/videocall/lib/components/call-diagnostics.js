const DiagnosticsTemplate = require('./call-diagnostics.template');

// Call-owned, bounded history. Signaling summaries never include SDP, candidate
// addresses, credentials, or transaction bodies. Stats are sampled only on demand.
class CallDiagnostics {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.history = new Map();
    this.samples = new Map();
    this.running = false;
    this.generation = 0;

    app.connection.on('start-stun-call', () => {
      this.stop();
      this.history.clear();
      this.samples.clear();
      this.running = true;
      this.record('local', 'Call started');
      this.updateVisibility();
    });
    app.connection.on('videocall-ended', () => this.stop());
    app.connection.on('reset-stun', () => this.stop());
    app.connection.on('stun-diagnostic', (peer, message) => {
      if (this.mod.room_obj?.call_peers?.includes(peer)) this.record(peer, message);
    });
    app.connection.on('relay-transaction', (tx) => {
      const msg = tx.msg;
      if (msg?.module !== 'Videocall' || msg.call_id !== this.mod.room_obj?.call_id) return;
      const message = `Submitted to relay: ${msg.request}`;
      this.record('local', message);
      for (const recipient of tx.to || []) {
        if (this.mod.room_obj?.call_peers?.includes(recipient.publicKey)) {
          this.record(recipient.publicKey, message);
        }
      }
    });
    for (const event of [
      'stun-connection-timeout',
      'stun-connection-failed',
      'stun-connection-close',
      'stun-data-channel-open',
      'stun-data-channel-close'
    ]) {
      app.connection.on(event, (peer) => {
        if (this.mod.room_obj?.call_peers?.includes(peer)) this.record(peer, event);
      });
    }
    for (const kind of ['audio', 'video']) {
      app.connection.on(`peer-toggle-${kind}-status`, ({ public_key, enabled }) => {
        this.record(public_key, `Peer reports ${kind} ${enabled ? 'enabled' : 'disabled'}`);
      });
    }
  }

  record(peer, message) {
    if (!this.running || !peer) return;
    if (peer === this.mod.publicKey) peer = 'local';
    // Bound both peers and entries, including peers that have since left.
    if (!this.history.has(peer)) {
      if (this.history.size >= 64) this.history.delete(this.history.keys().next().value);
      this.history.set(peer, []);
    }
    const entries = this.history.get(peer);
    entries.push(`${new Date().toISOString().slice(11, 23)} ${String(message).slice(0, 300)}`);
    if (entries.length > 100) entries.shift();
  }

  stop() {
    this.running = false;
    this.samples.clear();
    this.generation++;
    clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.videocall-diagnostics').forEach((panel) => panel.remove());
    }
  }

  updateVisibility() {
    this.generation++;
    clearInterval(this.timer);
    this.timer = null;
    if (!this.running || !this.app.options.stun?.settings?.diagnostics) {
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.videocall-diagnostics').forEach((panel) => panel.remove());
      }
      return;
    }
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 2000);
  }

  trackStatus(track) {
    return `${track.kind}: ${track.readyState}, ${track.enabled ? 'enabled' : 'disabled'}, ${track.muted ? 'muted/no data' : 'unmuted'}`;
  }

  async sample(peer, pc) {
    const generation = this.generation;
    const stats = await pc.getStats();
    const lines = [];
    const previous = this.samples.get(peer);
    const current = new Map();
    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') {
        const incoming = report.type === 'inbound-rtp';
        const bytes = report[incoming ? 'bytesReceived' : 'bytesSent'] || 0;
        const packets = report[incoming ? 'packetsReceived' : 'packetsSent'] || 0;
        const frames = report[incoming ? 'framesDecoded' : 'framesEncoded'];
        const old = previous?.pc === pc ? previous.reports.get(report.id) : null;
        const elapsed = old ? (report.timestamp - old.timestamp) / 1000 : 0;
        const rate =
          elapsed > 0 && bytes >= old.bytes
            ? `, ${(((bytes - old.bytes) * 8) / elapsed / 1000).toFixed(1)} kb/s`
            : '';
        const progress =
          old && frames !== undefined && old.frames !== undefined
            ? ` (+${Math.max(0, frames - old.frames)})`
            : '';
        lines.push(
          `${incoming ? 'IN' : 'OUT'} ${report.kind || report.mediaType}: ${bytes} bytes, ${packets} packets${rate}${frames !== undefined ? `, ${frames} frames${progress}` : ''}${incoming ? `, lost ${report.packetsLost ?? '?'}` : ''}`
        );
        current.set(report.id, { bytes, frames, timestamp: report.timestamp });
      }
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        const pair = stats.get(report.selectedCandidatePairId);
        if (!pair) return;
        const local = stats.get(pair.localCandidateId);
        const remote = stats.get(pair.remoteCandidateId);
        lines.push(
          `Route: ${local?.candidateType || '?'} → ${remote?.candidateType || '?'} (${local?.protocol || '?'})${pair.currentRoundTripTime !== undefined ? `, RTT ${Math.round(pair.currentRoundTripTime * 1000)} ms` : ''}`
        );
      }
    });
    if (generation !== this.generation || !this.running) return lines;
    this.samples.set(peer, { pc, reports: current });
    // Stale peer samples are unnecessary once a connection is removed.
    for (const key of this.samples.keys()) {
      if (!this.mod.stun?.peers.has(key)) this.samples.delete(key);
    }
    return lines.length ? lines : ['No RTP media statistics yet'];
  }

  async refresh() {
    if (this.refreshing || !this.running) return;
    this.refreshing = true;
    const generation = this.generation;
    try {
      const ids = new Set([
        'local',
        'connecting',
        'presentation',
        ...(this.mod.room_obj?.call_peers || []),
        ...this.history.keys()
      ]);
      await Promise.all(
        [...ids].map(async (id) => {
          const box =
            document.getElementById(`stream_${id}`) || document.getElementById(`audiostream_${id}`);
          if (!box) return;
          const peer =
            id === 'presentation'
              ? this.mod.screen_share === true
                ? 'local'
                : this.mod.screen_share
              : id;
          const pc = this.mod.stun?.peers.get(peer);
          const media = box.querySelector('video, audio');
          const lines = [];
          if (peer === 'local') {
            lines.push('Local capture / preview');
          } else if (pc) {
            lines.push(`Connection: ${pc.connectionState} | ICE: ${pc.iceConnectionState}`);
            lines.push(`Signaling: ${pc.signalingState} | Gathering: ${pc.iceGatheringState}`);
            lines.push(
              `Data channel: ${pc.dc?.readyState || 'none'} | Queued ICE: ${pc.pendingCandidates?.length || 0}`
            );
            for (const sender of pc.getSenders()) {
              if (sender.track) lines.push(`Send ${this.trackStatus(sender.track)}`);
            }
            for (const receiver of pc.getReceivers()) {
              if (receiver.track) lines.push(`Receive ${this.trackStatus(receiver.track)}`);
            }
            try {
              lines.push(...(await this.sample(peer, pc)));
            } catch (error) {
              lines.push(`Stats unavailable: ${error.name}`);
            }
          } else {
            lines.push('Waiting for peer connection');
          }
          const tracks = media?.srcObject?.getTracks() || [];
          if (peer === 'local') tracks.forEach((track) => lines.push(this.trackStatus(track)));
          lines.push(
            `Playback: ${!media?.srcObject ? 'no stream attached' : media.paused ? 'paused (autoplay may be blocked)' : 'playing'}, readyState ${media?.readyState ?? '?'}`
          );
          if (media?.tagName === 'VIDEO') {
            lines.push(
              `Video: ${media.videoWidth}×${media.videoHeight}, rendered frames ${media.getVideoPlaybackQuality?.().totalVideoFrames ?? '?'}`
            );
          }
          if (media?.error) lines.push(`Playback error: ${media.error.code}`);
          if (!tracks.some((track) => track.kind === 'video'))
            lines.push('No video track attached (camera may be off or audio-only call)');
          if (generation !== this.generation || !this.running || !box.isConnected) return;
          let panel = box.querySelector('.videocall-diagnostics');
          if (!panel) {
            box.insertAdjacentHTML('beforeend', DiagnosticsTemplate());
            panel = box.querySelector('.videocall-diagnostics');
            // Opening/selecting log text must not flip or drag the video tile.
            for (const event of ['click', 'dblclick', 'pointerdown', 'mousedown', 'touchstart']) {
              panel.addEventListener(event, (e) => e.stopPropagation());
            }
          }
          panel.querySelector('.videocall-diagnostics-status').textContent = lines.join('\n');
          const log = panel.querySelector('.videocall-diagnostics-log');
          const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 20;
          log.textContent = (
            this.history.get(peer === 'connecting' ? 'local' : peer) || [
              'No events recorded in this call yet'
            ]
          ).join('\n');
          if (follow) log.scrollTop = log.scrollHeight;
        })
      );
    } finally {
      this.refreshing = false;
    }
  }
}

module.exports = CallDiagnostics;
