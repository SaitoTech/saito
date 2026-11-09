const SwarmcastTemplate = require('./swarmcast.template');

const STATUS = {
  initializing: 'Starting the broadcast viewer',
  connecting: 'Contacting the broadcaster',
  waiting: 'Waiting for media',
  playing: 'Live',
  unavailable: 'This broadcast is unavailable',
  interrupted: 'The broadcast connection was interrupted',
  ended: 'The broadcast has ended'
};

class SwarmcastViewer {
  constructor(app, mod, route) {
    this.app = app;
    this.mod = mod;
    this.route = route;
    this.contact = '';
    this.publication = null;
    this.state = 'initializing';
    this.detail = STATUS.initializing;
    this.pending = new Map();
    this.trackMids = new Map();
    this.midMap = new Map();
    this.media = new Map();
    this.elements = new Map();
    this.subscribed = '';
    this.playback = new Set();
    this.closed = false;
    this.phase = 'waiting-relay';
    this.joinAttempt = 0;
    this.joinTimer = null;

    this.onTrack = (peerId, event) => {
      const mid = event?.transceiver?.mid;
      const track = event?.track;
      if (this.closed || peerId !== this.contact) {
        console.info(
          'SWARMCAST MEDIA TRACE',
          'track ignored',
          peerId,
          track?.kind || 'none',
          'mid',
          mid || 'none'
        );
        return;
      }
      if (!track) {
        console.info('SWARMCAST MEDIA TRACE', 'track ignored', peerId, 'no track');
        return;
      }
      if (!mid) {
        console.info('SWARMCAST MEDIA TRACE', 'track', track.kind, 'mid', 'none', 'retained', 'no');
        queueMicrotask(() => {
          if (!this.closed && event?.transceiver?.mid) this.onTrack(peerId, event);
        });
        return;
      }
      this.pending.set(mid, track);
      this.trackMids.set(track, mid);
      console.info('SWARMCAST MEDIA TRACE', 'track', track.kind, 'mid', mid, 'retained', 'yes');
      track.addEventListener('ended', () => {
        if (this.trackMids.get(track) === mid) this.pending.delete(mid);
        this.paint();
      });
      this.paint();
    };

    this.onChannel = (peerId) => {
      console.info(
        'SWARMCAST MEDIA TRACE',
        'data channel open',
        peerId,
        'contact',
        this.contact || 'none',
        'closed',
        this.closed
      );
      if (this.closed || peerId !== this.contact) return;
      this.sendSubscribe();
    };

    this.onChannelClose = (peerId) => {
      if (this.closed || peerId !== this.contact || this.state === 'ended') return;
      this.interrupt();
    };

    this.onLeave = () => this.destroy();
  }

  render() {
    if (document.querySelector('.swarmcast-viewer')) return;
    const holder = document.createElement('div');
    holder.innerHTML = SwarmcastTemplate(this.state, this.detail);
    document.body.appendChild(holder.firstElementChild);
    this.app.connection.on('stun-track-event', this.onTrack);
    this.app.connection.on('stun-data-channel-open', this.onChannel);
    this.app.connection.on('stun-data-channel-close', this.onChannelClose);
    window.addEventListener('beforeunload', this.onLeave);
    this.start();
  }

  mark(state, detail) {
    this.state = state;
    this.detail = detail || STATUS[state] || '';
    const root = document.querySelector('.swarmcast-viewer .swarmcast-status');
    if (!root) return;
    root.dataset.state = state;
    const label = root.querySelector('.swarmcast-status-label');
    const text = root.querySelector('.swarmcast-status-detail');
    if (label) label.textContent = state;
    if (text) text.textContent = this.detail;
  }

  async start() {
    this.phase = 'waiting-relay';
    this.joinAttempt = 0;
    this.mark('connecting');
    if (!this.route.broadcaster || !this.route.publicationId || !this.route.callId) {
      this.phase = 'unavailable';
      this.mark('unavailable', 'This broadcast link is incomplete');
      return;
    }
    if (this.mod.isRelayConnected) this.dispatchJoin();
  }

  noteRelay() {
    if (this.closed || this.phase !== 'waiting-relay') return;
    this.dispatchJoin();
  }

  async dispatchJoin() {
    if (this.closed || (this.phase !== 'waiting-relay' && this.phase !== 'joining')) return;
    this.phase = 'joining';
    this.joinAttempt += 1;
    const attempt = this.joinAttempt;
    try {
      await this.mod.sendSwarmcast(this.route.broadcaster, 'video-call-swarmcast-join-request', {
        publicationId: this.route.publicationId,
        callId: this.route.callId
      });
    } catch (err) {
      console.error(err);
      if (this.phase === 'joining' && this.joinAttempt === attempt) {
        this.phase = 'unavailable';
        this.mark('unavailable', 'The broadcaster could not be contacted');
      }
      return;
    }
    if (this.phase !== 'joining' || this.joinAttempt !== attempt) return;
    this.armJoinTimer();
  }

  armJoinTimer() {
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => this.onJoinTimeout(), 15000);
    this.joinTimer.unref?.();
  }

  onJoinTimeout() {
    if (this.phase !== 'joining') return;
    if (this.joinAttempt < 2) {
      this.dispatchJoin();
      return;
    }
    this.phase = 'unavailable';
    this.mark('unavailable', 'The broadcaster did not answer');
  }

  receiveJoin(data) {
    if (this.closed || this.phase !== 'joining' || data?.publicationId !== this.route.publicationId) {
      return;
    }
    clearTimeout(this.joinTimer);
    this.joinTimer = null;
    if (data.state !== 'ready' || !data.contact || !data.publication) {
      const reason =
        data.reason === 'existing-call-connection'
          ? 'This viewer already has a call connection to the broadcaster'
          : STATUS.unavailable;
      this.phase = 'unavailable';
      this.mark('unavailable', reason);
      return;
    }
    if (this.mod.peerManager?.peers?.get(data.contact)) {
      this.phase = 'unavailable';
      this.mark(
        'unavailable',
        'This browser already has a connection to the broadcaster, so the broadcast cannot open a second one'
      );
      return;
    }
    this.phase = 'dialing';
    this.contact = data.contact;
    this.applyPublication(data.publication);
    this.mark('connecting', 'Connecting to the broadcaster');
    this.mod.peerManager.createPeerConnection(this.contact, (peerId) => {
      if (this.closed || this.phase !== 'dialing' || peerId !== this.contact) return;
      Promise.resolve(this.mod.peerManager.sendJoinTransaction(peerId)).catch((err) => {
        console.error(err);
        this.mark('unavailable', 'The broadcaster could not be contacted');
        this.destroy();
      });
    });
  }

  receiveTracks(data) {
    if (this.closed || data?.publicationId !== this.route.publicationId) return;
    if (data.publication) this.applyPublication(data.publication);
    const outputs = data.outputs || [];
    const associations = outputs
      .map((output) => `${output.id}:${(output.mids || []).map((item) => item.mid).join('+')}`)
      .join(',');
    console.info(
      'SWARMCAST MEDIA TRACE',
      'receiveTracks',
      'mappings',
      outputs.length,
      'mids',
      associations || 'none'
    );
    this.midMap = new Map(outputs.map((output) => [output.id, output.mids || []]));
    this.paint();
    this.sendSubscribe();
  }

  receiveEnded(data) {
    if (this.closed || data?.publicationId !== this.route.publicationId) return;
    this.finish('ended');
  }

  applyPublication(publication) {
    this.publication = publication;
    const ids = new Set((publication.outputs || []).map((output) => output.id));
    for (const output of publication.outputs || []) {
      this.ensureOutput(output);
    }
    for (const id of [...this.elements.keys()]) {
      if (!ids.has(id)) this.removeOutput(id);
    }
  }

  ensureOutput(output) {
    if (this.elements.has(output.id)) {
      const label = this.elements.get(output.id).querySelector('p');
      if (label) label.textContent = output.label || output.id;
      return;
    }
    const box = document.createElement('div');
    box.className = 'swarmcast-output';
    box.dataset.output = output.id;
    const label = document.createElement('p');
    label.textContent = output.label || output.id;
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    const stream = new MediaStream();
    video.srcObject = stream;
    box.appendChild(label);
    box.appendChild(video);
    document.querySelector('.swarmcast-outputs')?.appendChild(box);
    this.elements.set(output.id, box);
    this.media.set(output.id, stream);
  }

  removeOutput(id) {
    for (const item of this.midMap.get(id) || []) {
      const track = this.pending.get(item.mid);
      this.pending.delete(item.mid);
      if (track) this.trackMids.delete(track);
    }
    const stream = this.media.get(id);
    if (stream) {
      for (const track of stream.getTracks()) stream.removeTrack(track);
    }
    this.elements.get(id)?.remove();
    this.elements.delete(id);
    this.media.delete(id);
    this.midMap.delete(id);
    this.playback?.delete(id);
  }

  paint() {
    let playing = false;
    let attached = 0;
    for (const [id, stream] of this.media) {
      const wanted = new Set((this.midMap.get(id) || []).map((item) => item.mid));
      for (const mid of wanted) {
        const track = this.pending.get(mid);
        if (!track || track.readyState === 'ended') continue;
        if (!stream.getTracks().includes(track)) stream.addTrack(track);
      }
      for (const track of stream.getTracks()) {
        const mid = this.trackMids.get(track);
        if (!mid || !wanted.has(mid) || track.readyState === 'ended') stream.removeTrack(track);
      }
      const count = stream.getTracks().length;
      attached += count;
      if (count) {
        playing = true;
        this.playOutput(id);
      }
    }
    console.info('SWARMCAST MEDIA TRACE', 'paint', 'attached', attached);
    if (this.state === 'ended' || this.state === 'unavailable' || this.state === 'interrupted') return;
    if (playing) this.mark('playing');
    else if (this.contact) this.mark('waiting');
  }

  playOutput(id) {
    const video = this.elements.get(id)?.querySelector('video');
    if (!video) {
      console.info('SWARMCAST MEDIA TRACE', 'play unavailable', id, 'no element');
      return;
    }
    if (this.playback.has(id)) return;
    this.playback.add(id);
    let pending = null;
    try {
      pending = typeof video.play === 'function' ? video.play() : null;
    } catch (err) {
      this.playback.delete(id);
      console.info('SWARMCAST MEDIA TRACE', 'play rejected', id, err?.name || err);
      return;
    }
    if (!pending?.then) {
      console.info('SWARMCAST MEDIA TRACE', 'play unavailable', id);
      return;
    }
    pending.then(
      () => {
        console.info('SWARMCAST MEDIA TRACE', 'play resolved', id);
      },
      (err) => {
        this.playback.delete(id);
        console.info('SWARMCAST MEDIA TRACE', 'play rejected', id, err?.name || err);
      }
    );
  }

  sendSubscribe() {
    const outputs = this.publication?.outputs?.length || 0;
    const connected = !!(
      this.mod.peerManager && this.mod.peerManager.hasConnectionWithPeer(this.contact)
    );
    console.info(
      'SWARMCAST MEDIA TRACE',
      'sendSubscribe',
      'publication',
      !!this.publication,
      'outputs',
      outputs,
      'connected',
      connected,
      'contact',
      this.contact || 'none'
    );
    if (!this.contact || !this.publication || !connected) {
      const reason = !this.contact ? 'no contact' : !this.publication ? 'no publication' : 'no peer connection';
      console.info('SWARMCAST MEDIA TRACE', 'subscribe withheld', reason);
      return;
    }
    const outputIds = (this.publication.outputs || []).map((output) => output.id);
    const key = outputIds.join(',');
    if (key === this.subscribed) {
      console.info('SWARMCAST MEDIA TRACE', 'subscribe withheld', 'unchanged', key || 'none');
      return;
    }
    console.info('SWARMCAST MEDIA TRACE', 'subscribe sent', key || 'none');
    this.subscribed = key;
    this.mark(this.state === 'playing' ? 'playing' : 'waiting');
    this.mod
      .sendSwarmcast(this.contact, 'video-call-swarmcast-subscribe', {
        publicationId: this.route.publicationId,
        callId: this.route.callId,
        outputIds
      })
      .catch((err) => {
        console.error(err);
        if (this.subscribed !== key || this.closed) return;
        this.subscribed = '';
        if (this.subscribeRetried) {
          this.mark('unavailable', 'The broadcast subscription did not complete');
          this.destroy();
          return;
        }
        this.subscribeRetried = true;
        this.sendSubscribe();
      });
  }

  interrupt() {
    if (this.closed || this.state === 'ended') return;
    this.mark('interrupted');
    this.destroy();
  }

  finish(state) {
    this.mark(state);
    this.destroy();
  }

  destroy() {
    if (this.closed) return;
    this.closed = true;
    this.phase = 'closed';
    clearTimeout(this.joinTimer);
    this.joinTimer = null;
    this.app.connection.removeListener?.('stun-track-event', this.onTrack);
    this.app.connection.removeListener?.('stun-data-channel-open', this.onChannel);
    this.app.connection.removeListener?.('stun-data-channel-close', this.onChannelClose);
    window.removeEventListener('beforeunload', this.onLeave);
    if (this.contact) this.mod.peerManager?.removePeerConnection?.(this.contact);
    for (const id of [...this.elements.keys()]) this.removeOutput(id);
    this.pending.clear();
    this.trackMids.clear();
  }
}

module.exports = SwarmcastViewer;
