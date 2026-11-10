/**
 * Call media and the registry of every stream Video Call knows about.
 *
 * Stream ids are opaque. A public key is the source machine (`source`) or the
 * Stun leg (`peerId`), never the stream id. One machine can publish several
 * streams. Remote camera tracks still share one MediaStream per peer: they
 * arrive without a stream association, so a second independent remote stream
 * from the same peer needs a future signalling change.
 */

const Stream = require('./stream');
const StreamCapture = require('./stream-capture');
const Peer = require('./peer');

function callMount(entry) {
  if (!entry || entry.session !== 'call') {
    return null;
  }
  if (entry.kind === 'display') {
    return 'presentation';
  }
  if (entry.kind === 'camera' && entry.origin === 'local') {
    return 'local';
  }
  if (entry.kind === 'camera' && entry.origin === 'remote' && entry.peerId) {
    return entry.peerId;
  }
  return null;
}

class Streams {
  constructor(app, mod, settings) {
    this.app = app;
    this.mod = mod;
    this.entries = new Map();
    this.sequence = 0;
    this.generation = 0;
    this.transcribingPeers = new Set();

    this.videoEnabled = true;
    this.audioEnabled = true;
    this.videoSource = null;
    this.audioSource = null;
    this.auto_disconnect = false;
    this.active = false;

    this.monitors = {};
    this.listeners = {};
    this.listening = false;
    this.leaving = false;

    this.parseSettings(settings);
    this.capture = new StreamCapture(this);
  }

  // The browser object for the local call camera. Derived from the registry.
  get localStream() {
    return this.find({ kind: 'camera', origin: 'local', session: 'call' })?.mediaStream || null;
  }

  // The call's display capture, local or remote. Derived from the registry.
  get presentationStream() {
    return this.find({ kind: 'display', session: 'call' })?.mediaStream || null;
  }

  // Legacy `{ peerId -> MediaStream, presentation }` view. Trackless pending
  // entries are omitted so consumers do not treat a placeholder as media.
  get remoteStreams() {
    const map = new Map();
    for (const entry of this.list({ kind: 'camera', origin: 'remote', session: 'call' })) {
      if (entry.peerId && entry.mediaStream?.getTracks?.().length) {
        map.set(entry.peerId, entry.mediaStream);
      }
    }
    const display = this.find({ kind: 'display', session: 'call' });
    if (display?.peerId && display.mediaStream?.getTracks?.().length) {
      map.set('presentation', display.mediaStream);
    }
    return map;
  }

  allocateId() {
    this.sequence += 1;
    return `s${this.sequence.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  blankStream() {
    if (typeof MediaStream === 'function') {
      return new MediaStream();
    }
    const tracks = [];
    return {
      getTracks: () => tracks,
      getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
      getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
      addTrack(track) {
        if (!tracks.includes(track)) tracks.push(track);
      },
      removeTrack(track) {
        const index = tracks.indexOf(track);
        if (index >= 0) tracks.splice(index, 1);
      }
    };
  }

  register(fields = {}) {
    const id = fields.id || this.allocateId();
    if (this.entries.has(id)) {
      return this.update(id, fields);
    }
    const entry = new Stream({
      id,
      source: fields.source ?? null,
      kind: fields.kind,
      origin: fields.origin,
      session: fields.session || 'call',
      availability: fields.availability || 'live',
      disposition: fields.disposition || 'borrowed',
      mediaStream: fields.mediaStream ?? null,
      peerId: fields.peerId ?? null
    });
    this.entries.set(id, entry);
    this.announce(entry, 'added');
    return entry;
  }

  get(id) {
    return this.entries.get(id) || null;
  }

  list(filter = {}) {
    return [...this.entries.values()].filter((entry) =>
      Object.entries(filter).every(([key, value]) => entry[key] === value)
    );
  }

  find(filter) {
    return this.list(filter)[0] || null;
  }

  update(id, changes = {}) {
    const entry = this.entries.get(id);
    if (!entry) {
      return null;
    }
    const previous = entry.mediaStream;
    Object.assign(entry, changes, { id });
    if (
      entry.disposition === 'owned' &&
      previous &&
      changes.mediaStream &&
      changes.mediaStream !== previous
    ) {
      previous.getTracks?.().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.error(err);
        }
      });
    }
    this.announce(entry, 'updated');
    return entry;
  }

  remove(id) {
    const entry = this.entries.get(id);
    if (!entry) {
      return null;
    }
    this.entries.delete(id);
    if (entry.disposition === 'owned') {
      entry.mediaStream?.getTracks?.().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.error(err);
        }
      });
    }
    this.app?.connection?.emit('videocall-stream-removed', entry);
    return entry;
  }

  registerExternal(mediaStream, fields = {}) {
    return this.register({
      source: fields.source ?? null,
      session: fields.session || 'standalone',
      availability: 'live',
      peerId: null,
      ...fields,
      kind: 'external',
      origin: 'application',
      disposition: 'borrowed',
      mediaStream
    });
  }

  registerComposite(mediaStream, fields = {}) {
    return this.register({
      source: fields.source ?? this.mod.publicKey,
      origin: fields.origin || 'local',
      session: fields.session || 'broadcast',
      availability: 'live',
      peerId: null,
      kind: 'composite',
      disposition: fields.disposition === 'borrowed' ? 'borrowed' : 'owned',
      mediaStream
    });
  }

  announce(entry, verb) {
    this.app?.connection?.emit(`videocall-stream-${verb}`, entry);
    const mount = callMount(entry);
    if (!mount || !entry.mediaStream?.getTracks?.().length) {
      return;
    }
    this.app.connection.emit('videocall-stream', mount, entry.mediaStream);
  }

  adoptTrack(entry, track) {
    if (!entry.mediaStream) {
      entry.mediaStream = this.blankStream();
    }
    const stream = entry.mediaStream;
    // A refreshed peer delivers a new track of the same kind. The video
    // element keeps showing the first track, so the ended one has to leave.
    for (const current of stream.getTracks()) {
      if (current !== track && current.kind === track.kind) {
        stream.removeTrack(current);
      }
    }
    if (!stream.getTracks().includes(track)) {
      stream.addTrack(track);
    }
    entry.availability = 'live';
    this.announce(entry, 'updated');
    return entry;
  }

  ensureRemote(peerId) {
    if (!peerId) {
      return null;
    }
    const existing = this.find({ kind: 'camera', origin: 'remote', session: 'call', peerId });
    if (existing) {
      return existing;
    }
    return this.register({
      source: peerId,
      kind: 'camera',
      origin: 'remote',
      session: 'call',
      availability: 'pending',
      disposition: 'borrowed',
      mediaStream: this.blankStream(),
      peerId
    });
  }

  noteDisplay(source) {
    const existing = this.find({ kind: 'display', session: 'call' });
    if (existing && existing.peerId === source) {
      return existing;
    }
    if (existing) {
      this.remove(existing.id);
    }
    return this.register({
      source,
      kind: 'display',
      origin: source === this.mod.publicKey ? 'local' : 'remote',
      session: 'call',
      availability: 'pending',
      disposition: source === this.mod.publicKey ? 'owned' : 'borrowed',
      mediaStream: this.blankStream(),
      peerId: source
    });
  }

  clearDisplay() {
    for (const entry of this.list({ kind: 'display', session: 'call' })) {
      this.remove(entry.id);
    }
  }

  clearCallEntries() {
    for (const entry of this.list({ session: 'call' })) {
      this.remove(entry.id);
    }
  }

  placeLocal(captured) {
    const existing = this.find({ kind: 'camera', origin: 'local', session: 'call' });
    const fields = {
      source: this.mod.publicKey,
      kind: 'camera',
      origin: 'local',
      session: 'call',
      availability: 'live',
      disposition: 'owned',
      mediaStream: captured,
      peerId: this.mod.publicKey
    };
    if (existing) {
      return this.update(existing.id, fields);
    }
    return this.register(fields);
  }

  attach() {
    if (this.listening) {
      return;
    }
    this.listening = true;

    this.listen('stun-connection-connected', (peerId) => {
      if (!this.active) {
        return;
      }

      console.debug('TALK [stun-connection-connected] ', this.active, peerId);

      if (!this.mod?.room_obj || !this.mod.room_obj.call_peers.includes(peerId)) {
        return;
      }

      let pc = this.mod.peerManager.peers.get(peerId);
      if (pc.firstConnect) {
        let sound = new Audio('/saito/sound/Polite.mp3');
        sound.play();
        pc.firstConnect = false;
      }

      this.mod.sendOffChainMessage('toggle-audio', {
        public_key: this.mod.publicKey,
        enabled: this.audioEnabled
      });

      this.mod.sendOffChainMessage('toggle-video', {
        public_key: this.mod.publicKey,
        enabled: this.videoEnabled
      });
      this.broadcastTranscriptionStatus();

      if (this.monitors[peerId]) {
        clearInterval(this.monitors[peerId]);
        delete this.monitors[peerId];
      }

      let my_stats = {};

      this.monitors[peerId] = setInterval(async () => {
        if (this.mod.peerManager.hasConnection && !this.mod.peerManager.hasConnection(peerId)) {
          clearInterval(this.monitors[peerId]);
          delete this.monitors[peerId];
          return;
        }
        if (typeof pc?.getStats !== 'function') {
          return;
        }

        let stats = await pc.getStats();
        if (!this.listening) return;

        stats.forEach((value) => {
          if (value.type == 'remote-inbound-rtp' && value.kind == 'video') {
            let rP = value.packetsReceived || 0;
            let rL = value.packetsLost || 0;

            my_stats.jitter = value.jitter * 1000 || 0;
            my_stats.packetLoss = rL / (rP + rL) || 0;
            my_stats.rtt = value.roundTripTime * 1000 || 0;
          }
        });

        let effective_rtt = my_stats.rtt + my_stats.jitter * 2 + 10;
        if (effective_rtt < 160) {
          my_stats.rFactor = 93.2 - effective_rtt / 40;
        } else {
          my_stats.rFactor = 93.2 - effective_rtt / 120 - 10;
        }
        my_stats.rFactor = my_stats.rFactor - my_stats.packetLoss * 2.5;

        my_stats.rFactor = Math.max(my_stats.rFactor, 0);

        my_stats.mos =
          1 +
          0.035 * my_stats.rFactor +
          0.000007 * my_stats.rFactor * (my_stats.rFactor - 60) * (100 - my_stats.rFactor);

        this.mod.CallInterface?.updateConnectionStrength?.(peerId, my_stats.mos);
      }, 1000);
    });

    this.listen('stun-update-connection-message', () => {
      if (this.active) {
        this.broadcastPeerList();
      }
    });

    this.listen('stun-track-event', (peerId, event) => {
      // Camera tracks are added with no MediaStream, so they share one entry
      // per peer. Display tracks arrive associated with the presentation
      // stream and only while that peer is the current presenter.
      const display = peerId === this.mod.screen_share && event?.streams?.length;
      const entry = display
        ? this.find({ kind: 'display', session: 'call', peerId }) || this.noteDisplay(peerId)
        : this.find({ kind: 'camera', origin: 'remote', session: 'call', peerId }) ||
          this.ensureRemote(peerId);

      console.info(
        'TALK [stun-track-event]: remote stream (track) added for',
        entry.id,
        event.track,
        event.streams
      );

      this.adoptTrack(entry, event.track);

      if (!this.active) {
        console.warn('STUN/TALK: Receiving media tracks before in call state');
      }
    });

    this.listen('stun-new-peer-connection', async (publicKey, peerConnection) => {
      if (!this.active) {
        return;
      }

      console.info('TALK [stun-new-peer-connection]: ' + publicKey);
      console.debug(JSON.parse(JSON.stringify(this.mod.room_obj)));

      if (!this.mod.room_obj.call_peers.includes(publicKey)) {
        return;
      }

      this.ensureRemote(publicKey);
      peerConnection.firstConnect = true;

      const generation = this.generation;
      const currentConnection = () =>
        this.listening &&
        this.generation === generation &&
        this.active &&
        this.mod.peerManager.peers.get(publicKey) === peerConnection &&
        peerConnection.signalingState !== 'closed';
      const attach = () => {
        if (!currentConnection() || !this.localStream) return;
        try {
          const camera = this.find({ kind: 'camera', origin: 'local', session: 'call' });
          const peer = this.mod.peers?.get(publicKey) || this.mod.peers?.add(publicKey) || new Peer(this.mod, publicKey);
          camera?.getTracks().forEach((track) => {
            if (peerConnection.getSenders().some((sender) => sender.track === track)) return;
            console.info(
              'TALK [stun-new-peer-connection] sending new track to ' + publicKey,
              track
            );
            this.mod.diagnostics?.record(publicKey, `Attached local ${track.kind} track`);
          });
          if (camera) peer.addStream(camera, 'call');
          this.mod.applyCameraProfile?.();
        } catch (err) {
          this.mod.diagnostics?.record(publicKey, `Attach media failed: ${err.name}`);
          console.error(err);
        }
      };

      if (this.localStream) {
        attach();
      } else {
        this.getLocalMedia().then(attach).catch((err) => {
          this.mod.diagnostics?.record(publicKey, `Local media unavailable: ${err.name}`);
        });
      }

      const presentation = this.find({ kind: 'display', origin: 'local', session: 'call' });
      if (presentation?.mediaStream) {
        setTimeout(async () => {
          if (!currentConnection() || !this.find({ id: presentation.id })) return;
          await this.mod.sendOffChainMessage('screen-share-start', {});
          if (!currentConnection() || !presentation.mediaStream) return;
          const peer = this.mod.peers?.get(publicKey) || this.mod.peers?.add(publicKey) || new Peer(this.mod, publicKey);
          peer.addStream(presentation, 'call');
          this.mod.applyScreenShareBitrate?.();
        }, 1500);
      }
    });
  }

  listen(event, handler) {
    this.listeners[event] = handler;
    this.app.connection.on(event, handler);
  }

  detach() {
    if (!this.listening && !Object.keys(this.listeners).length) {
      return;
    }
    this.listening = false;

    for (const event of Object.keys(this.listeners)) {
      this.app.connection.removeListener(event, this.listeners[event]);
    }
    this.listeners = {};

    for (const peerId of Object.keys(this.monitors)) {
      clearInterval(this.monitors[peerId]);
      delete this.monitors[peerId];
    }
  }

  // Drop the call session. The manager and non-call entries remain.
  releaseCall() {
    this.generation += 1;
    this.active = false;
    this.detach();
    this.clearCallEntries();
    this.leaving = false;
    this.videoEnabled = true;
    this.audioEnabled = true;
    this.auto_disconnect = false;
    this.transcribingPeers.clear();
  }

  destroy() {
    this.releaseCall();
    for (const id of [...this.entries.keys()]) {
      this.remove(id);
    }
  }

  async start() {
    this.attach();
    this.active = true;
    this.leaving = false;
    const generation = this.generation;
    this.mod.diagnostics?.beginCall?.();

    this.app.browser.lockNavigation(this.visibilityChange.bind(this), true);

    console.info('TALK [start]', JSON.parse(JSON.stringify(this.mod.room_obj)));

    this.app.connection.emit('videocall-call-started', this.videoEnabled, this.audioEnabled);

    await this.getLocalMedia();
    if (generation !== this.generation || !this.active) return;

    // A restored call connects when the relay is up, not while the windows render.
    if (!this.mod.call_reconnect) {
      this.mod.sendCallEntryTransaction();
    }

    let sound = new Audio('/saito/sound/Calm.mp3');
    sound.play();

    console.info('TALK [StreamManager] restore remote streams....');
  }

  async toggleVideo() {
    if (!this.active) {
      console.warn('TALK [stun-toggle] event when not active...');
      return;
    }

    if (this.videoEnabled === true) {
      if (!this.localStream.getVideoTracks()[0]) return;
      this.localStream.getVideoTracks()[0].enabled = false;
      this.videoEnabled = false;
    } else {
      this.videoEnabled = true;

      if (!this.localStream.getVideoTracks()?.length) {
        try {
          const newLocalStream = await this.capture.openUserMedia(
            this.returnConstraints(true)
          );
          if (!this.active) {
            newLocalStream.getTracks().forEach((track) => track.stop());
            return;
          }

          const videoTrack = newLocalStream.getVideoTracks()[0];
          this.localStream.addTrack(videoTrack);
          const camera = this.find({ kind: 'camera', origin: 'local', session: 'call' });
          if (camera) this.announce(camera, 'updated');

          await this.attachCameraToPeers(videoTrack);
          this.mod.applyCameraProfile?.();
        } catch (err) {
          this.mod.diagnostics?.record('local', `Enable camera failed: ${err.name}`);
          console.error('TALK [toggleVideo] ERROR:', err);
        }
      } else {
        this.localStream.getVideoTracks()[0].enabled = true;
      }
    }

    this.mod.sendOffChainMessage('toggle-video', {
      enabled: this.videoEnabled,
      public_key: this.mod.publicKey
    });
    this.app.connection.emit('videocall-peer-video-changed', {
      enabled: this.videoEnabled,
      public_key: this.mod.publicKey
    });
  }

  async toggleAudio() {
    if (!this.active) {
      console.warn('TALK [stun-toggle] event when not active...');
      return;
    }

    this.audioEnabled = !this.audioEnabled;

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = this.audioEnabled;
    });

    this.app.connection.emit('videocall-peer-audio-changed', {
      enabled: this.audioEnabled,
      public_key: 'local'
    });

    this.mod.sendOffChainMessage('toggle-audio', {
      public_key: this.mod.publicKey,
      enabled: this.audioEnabled
    });
  }

  async beginShareScreen() {
    if (!this.active) {
      return;
    }
    const entry = await this.capture.display();
    if (!entry) return;

    this.mod.screen_share = true;
    await this.mod.sendOffChainMessage('screen-share-start', {});
    console.debug('TALK [begin-screen-share]: ', this.mod.room_obj.call_peers, this.mod.peerManager.peers);

    this.mod.peerManager.peers.forEach((_pc, key) => {
      if (this.mod.room_obj.call_peers.includes(key)) {
        const peer = this.mod.peers?.get(key) || this.mod.peers?.add(key) || new Peer(this.mod, key);
        peer.addStream(entry, 'call');
      }
    });
    this.mod.applyScreenShareBitrate?.();
    this.mod.CallInterface?.setPresenting?.(true);
  }

  stopShareScreen() {
    if (!this.active) {
      return;
    }
    this.endPresentation();
  }

  parseSettings(settings) {
    this.videoEnabled = false;

    if (settings?.video) {
      this.videoEnabled = true;
      if (settings.video !== true) {
        this.videoSource = settings.video;
      }
    }

    this.audioEnabled = false;
    if (settings?.audio) {
      this.audioEnabled = true;
      if (settings.audio !== true) {
        this.audioSource = settings.audio;
      }
    }

    this.auto_disconnect = this?.auto_disconnect || settings?.auto_disconnect;
  }

  async updateInputs(type, source) {
    if (type == 'video') {
      this.videoSource = source;
      this.videoEnabled = true;
    } else {
      this.audioSource = source;
      this.audioEnabled = true;
    }

    this.app.options.stun.settings[`preferred_${type}`] = source;
    this.app.storage.saveOptions();

    if (!this.localStream) return;

    if (type == 'video') {
      await this.replaceCameraTrack();
      return;
    }

    console.debug('TALK [updateInputs]: ', type, source);
    this.localStream.getTracks().forEach((track) => {
      track.stop();
    });
    this.getLocalMedia();
  }

  async replaceCameraTrack() {
    let captured = null;
    try {
      captured = await this.capture.openUserMedia(this.returnConstraints(true));
    } catch (err) {
      this.mod.diagnostics?.record('local', `Camera capture failed: ${err.name}`);
      console.error('TALK [updateInputs]', err);
      return;
    }
    if (!this.active && this.generation) {
      captured.getTracks().forEach((track) => track.stop());
      return;
    }

    const videoTrack = captured.getVideoTracks()[0];
    if (!videoTrack) {
      captured.getTracks().forEach((track) => track.stop());
      return;
    }
    captured.getAudioTracks().forEach((track) => track.stop());

    const camera = this.find({ kind: 'camera', origin: 'local', session: 'call' });
    const previous = this.localStream.getVideoTracks()[0] || null;
    if (previous) this.localStream.removeTrack(previous);
    this.localStream.addTrack(videoTrack);

    try {
      await this.attachCameraToPeers(videoTrack);
    } catch (err) {
      this.localStream.removeTrack(videoTrack);
      if (previous) this.localStream.addTrack(previous);
      videoTrack.stop();
      this.mod.diagnostics?.record('local', `Camera replacement failed: ${err.name}`);
      console.error('TALK [updateInputs]', err);
      return;
    }

    if (previous) previous.stop();
    if (camera) this.announce(camera, 'updated');
    await this.mod.applyCameraProfile?.();
  }

  async attachCameraToPeers(videoTrack) {
    const changed = [];
    try {
      for (const [key, peerConnection] of this.mod.peerManager.peers) {
        if (!this.mod.room_obj?.call_peers?.includes(key)) continue;
        const cameraSender = peerConnection
          .getSenders()
          .find((sender) => sender.trackRole === 'camera');
        if (cameraSender) {
          const previousTrack = cameraSender.track;
          await cameraSender.replaceTrack(videoTrack);
          changed.push({ sender: cameraSender, previousTrack });
        } else {
          peerConnection.addTrack(videoTrack);
          this.markOutgoingSender(peerConnection, videoTrack, 'camera');
          const sender = peerConnection
            .getSenders()
            .find((item) => item.track === videoTrack && item.trackRole === 'camera');
          changed.push({ sender, previousTrack: null, peerConnection });
        }
      }
    } catch (err) {
      for (const change of changed.reverse()) {
        if (change.previousTrack && change.sender?.replaceTrack) {
          await change.sender.replaceTrack(change.previousTrack).catch(() => {});
        } else if (change.peerConnection?.removeTrack && change.sender) {
          try {
            change.peerConnection.removeTrack(change.sender);
          } catch (removeError) {
            console.error('TALK [attachCameraToPeers]', removeError);
          }
        }
      }
      throw err;
    }
  }

  returnConstraints(onlyVideo = false) {
    let constraints = {};

    if (this.videoSource) {
      constraints.video = { deviceId: this.videoSource };
    } else if (this.videoEnabled) {
      constraints.video = true;
    } else {
      constraints.video = false;
    }

    if (!onlyVideo) {
      if (this.audioSource) {
        constraints.audio = { deviceId: this.audioSource };
      } else {
        constraints.audio = true;
      }
    }

    return constraints;
  }

  async getLocalMedia() {
    const generation = this.generation;
    if (!this.active) return;

    if (this.localStream) {
      let shouldReturn = true;
      this.localStream.getTracks().forEach((track) => {
        if (track.readyState === 'ended') {
          console.warn('TALK [getLocalMedia]: Track ready state is ended, reacquiring media...');
          shouldReturn = false;
        }
      });
      if (shouldReturn) return;
    }

    let c = this.returnConstraints();

    console.debug('TALK [getLocalMedia]: ', this.videoSource, this.audioSource, c);

    this.mod.diagnostics?.record('local', `Requesting media: video=${!!c.video}, audio=${!!c.audio}`);
    let captured = null;
    try {
      captured = await this.capture.openUserMedia(c);
    } catch (err) {
      console.warn('TALK [getLocalMedia] Problem attempting to get User Media', err);

      this.mod.diagnostics?.record('local', `Media capture failed: ${err.name}; retrying audio only`);
      this.videoEnabled = false;
      c.video = false;

      try {
        captured = await this.capture.openUserMedia(c);
      } catch (error) {
        this.mod.diagnostics?.record('local', `Audio capture failed: ${error.name}`);
        throw error;
      }
    }

    if (generation !== this.generation || !this.active) {
      captured?.getTracks().forEach((track) => track.stop());
      return;
    }

    const placed = this.placeLocal(captured);

    captured.getAudioTracks().forEach((track) => {
      track.enabled = this.audioEnabled;
    });

    this.mod.diagnostics?.record(
      'local',
      `Captured ${captured.getAudioTracks().length} audio / ${captured.getVideoTracks().length} video tracks`
    );
    await this.mod.applyCameraProfile?.();
    return placed;
  }

  captureCamera(options) {
    if (options?.video === false) this.videoEnabled = false;
    if (options?.audio === false) this.audioEnabled = false;
    if (options?.video && options.video !== true) this.videoSource = options.video.deviceId || options.video;
    if (options?.audio && options.audio !== true) this.audioSource = options.audio.deviceId || options.audio;
    return this.getLocalMedia();
  }

  async captureDisplay() {
    if (!this.active) return null;
    let captured = null;
    try {
      captured = await this.capture.openDisplay({
        video: true,
        audio: true,
        selfBrowserSurface: 'include',
        monitorTypeSurfaces: 'include',
        systemAudio: 'include'
      });
    } catch (err) {
      captured?.getTracks?.().forEach((track) => track.stop());
      this.mod.diagnostics?.record('local', `Screen capture failed: ${err.name}`);
      console.error('TALK [begin-screen-share]: Error:', err);
      return null;
    }
    if (!this.active) {
      captured.getTracks().forEach((track) => track.stop());
      return null;
    }
    this.clearDisplay();
    const entry = this.register({
      source: this.mod.publicKey,
      kind: 'display',
      origin: 'local',
      session: 'call',
      availability: 'live',
      disposition: 'owned',
      mediaStream: captured,
      peerId: this.mod.publicKey
    });
    captured.getVideoTracks()[0].onended = this.endPresentation.bind(this);
    return entry;
  }

  adoptRemote(peerKey) {
    return this.ensureRemote(peerKey);
  }

  markOutgoingSender(peerConnection, track, trackRole) {
    if (track?.kind !== 'video') return;
    const sender = peerConnection.getSenders().find((item) => item.track === track);
    if (sender) sender.trackRole = trackRole;
  }

  setCameraCapture({ width, height, frameRate }) {
    this.pendingCameraCapture = { width, height, frameRate };
    if (!this.cameraCaptureQueue) {
      this.cameraCaptureQueue = this.drainCameraCapture();
    }
    return this.cameraCaptureQueue;
  }

  async drainCameraCapture() {
    try {
      while (this.pendingCameraCapture) {
        const requested = this.pendingCameraCapture;
        this.pendingCameraCapture = null;
        await this.applyCameraCapture(requested);
      }
    } finally {
      this.cameraCaptureQueue = null;
      if (this.pendingCameraCapture) return this.setCameraCapture(this.pendingCameraCapture);
    }
  }

  async applyCameraCapture({ width, height, frameRate }) {
    const track = this.localStream?.getVideoTracks?.()[0];
    if (!track || track.readyState === 'ended' || typeof track.applyConstraints !== 'function') {
      return;
    }
    const key = `${width}x${height}@${frameRate}`;
    if (track.cameraCaptureKey === key) return;
    try {
      await track.applyConstraints({
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: frameRate }
      });
      if (this.pendingCameraCapture) return;
      track.cameraCaptureKey = key;
    } catch (err) {
      this.mod.diagnostics?.record('local', `Camera capture failed: ${err.name}`);
      console.error('TALK [setCameraCapture]', err);
    }
  }

  setTranscribing(enabled) {
    if (!this.active) return;
    this.updateTranscriptionStatus(this.mod.publicKey, enabled);
    this.broadcastTranscriptionStatus();
  }

  broadcastTranscriptionStatus() {
    void this.mod.sendOffChainMessage('toggle-transcription', {
      enabled: this.transcribingPeers.has(this.mod.publicKey)
    }).catch((error) => console.error('TALK: Could not share transcription status', error));
  }

  updateTranscriptionStatus(peer, enabled) {
    if (enabled) this.transcribingPeers.add(peer);
    else this.transcribingPeers.delete(peer);
    this.app.connection.emit('peer-toggle-transcription-status', {
      public_key: peer,
      enabled
    });
  }

  removePeer(peer, message = 'left the meeting') {
    this.updateTranscriptionStatus(peer, false);
    this.app.connection.emit('videocall-peer-left', peer);
    for (const entry of this.list({ kind: 'camera', origin: 'remote', session: 'call', peerId: peer })) {
      this.remove(entry.id);
    }

    // call_peers lists the other participants, and disconnect() has already
    // removed the person who just left. An empty list means this was a
    // two-person call, so the remaining participant hangs up too.
    const remaining = this.mod.room_obj?.call_peers?.length || 0;
    if (remaining === 0) {
      siteMessage(`${this.app.keychain.returnUsername(peer)} hung up`, 1500);
      setTimeout(() => {
        this.leaveCall();
      }, 1500);
    } else {
      siteMessage(`${this.app.keychain.returnUsername(peer)} ${message}`, 2500);
    }

    let sound = new Audio('/saito/sound/Sharp.mp3');
    sound.play();

    this.broadcastPeerList();
  }

  async leaveCall() {
    if (this.leaving || !this.active) return;
    console.info('TALK [leaveCall]: hanging up...');
    if (this.mod.swarmcast && this.mod.departBroadcast) {
      await this.mod.departBroadcast();
    }

    const callId = this.mod.room_obj?.call_id;
    this.mod.clearPersistedCall?.(callId);
    if (callId) this.app.keychain.addKey(callId, { ended: true });
    this.leaving = true;
    this.generation += 1;
    this.active = false;
    this.detach();
    const completion = [];
    this.app.connection.emit('videocall-call-ended', completion);
    void Promise.allSettled(completion);

    this.app.browser.unlockNavigation(this.visibilityChange.bind(this));

    this.endPresentation();

    const disconnecting = this.mod.sendCallDisconnectTransaction();
    this.mod.CallInterface?.close?.();
    await disconnecting;

    this.clearCallEntries();

    this.mod.resetCall();

    this.videoEnabled = true;
    this.audioEnabled = true;
    this.auto_disconnect = false;
    this.transcribingPeers.clear();
    this.leaving = false;

    console.info('TALK [leaveCall]: successfully disconnected...');
    let sound = new Audio('/saito/sound/Sharp.mp3');
    sound.play();
  }

  endPresentation() {
    const sharing = this.mod.screen_share === true;
    const local = this.find({ kind: 'display', origin: 'local', session: 'call' });
    if (local) {
      this.remove(local.id);
    }

    if (sharing) {
      console.info('TALK [endPresentation] Screen sharing stopped by user');
      this.mod.screen_share = null;
      this.mod.CallInterface?.switchLayout?.(
        this.app.options.stun.settings?.layout || this.mod.layout
      );
      this.mod.CallInterface?.setPresenting?.(false);
      this.mod.sendOffChainMessage('screen-share-stop');
    }
  }

  broadcastPeerList() {
    let peer_list = {};

    this.mod.peerManager.peers.forEach((pc, address) => {
      if (this.mod.room_obj.call_peers.includes(address)) {
        peer_list[address] = pc.connectionState;
      }
    });

    this.mod.sendOffChainMessage('broadcast-call-list', peer_list);
  }

  visibilityChange() {
    this.mod.persistSwarmcastState?.();
    this.mod.touchCallSession?.();
  }
}

module.exports = Streams;
module.exports.callMount = callMount;
