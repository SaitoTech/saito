const SwarmcastTemplate = require('./swarmcast.template');
const VideoBox = require('./videobox');
const { ASPECT, arrangeTiles } = require('./swarmcast-layout');
const { pipelineTrace, reported, compareCounters, selectRtpReport, interpretMedia } = require('../swarmcast');

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
    this.tiles = new Map();
    this.audio = new Map();
    this.entered = false;
    this.entry = 'connecting';
    this.tracksListed = false;
    this.subscribed = '';
    this.playback = new Set();
    this.playbackTrack = new Map();
    this.videoWatch = new WeakSet();
    this.trackOwner = new Map();
    this.playbackBlocked = false;
    this.closed = false;
    this.layout = 'auto';
    this.order = [];
    this.customOrder = false;
    this.sizes = {};
    this.split = 0.7;
    this.focusId = null;
    this.muted = false;
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
      for (const eventName of ['mute', 'unmute', 'ended']) {
        track.addEventListener?.(eventName, () => {
          const id = this.trackOwner.get(track) || 'unmapped';
          pipelineTrace('viewer', 'track', {
            publication: this.route?.publicationId || 'none',
            broadcaster: this.contact || 'none',
            output: id,
            track: track.id,
            mid,
            kind: track.kind,
            event: eventName,
            readyState: track.readyState,
            enabled: track.enabled,
            muted: track.muted
          });
          if (eventName === 'unmute' && track.kind === 'video' && id !== 'unmapped') {
            this.traceVideo(id, 'unmute');
            this.sampleInbound(id, 'unmute');
          }
        });
      }
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

    this.onConnected = (peerId) => {
      if (this.closed || peerId !== this.contact) return;
      this.sendSubscribe();
      if (!this.entered) this.considerReady();
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
    this.bindToolbar();
    this.bindShare();
    this.watchStage();
    this.refreshEntry();
    this.app.connection.on('stun-track-event', this.onTrack);
    this.app.connection.on('stun-data-channel-open', this.onChannel);
    this.app.connection.on('stun-connection-connected', this.onConnected);
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
    if (this.entered) this.refreshEntry();
    else this.considerReady();
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
    this.refreshEntry();
    this.mark('connecting', 'Connecting to the broadcaster');
    this.mod.peers.connect(this.contact, { role: 'offer', onReady: (peerId) => {
      if (this.closed || this.phase !== 'dialing' || peerId !== this.contact) return;
      Promise.resolve(this.mod.peerManager.sendJoinTransaction(peerId)).catch((err) => {
        console.error(err);
        this.mark('unavailable', 'The broadcaster could not be contacted');
        this.destroy();
      });
    }});
  }

  receiveAdmission(data) {
    if (this.closed || this.phase !== 'joining' || data?.direction !== 'down' || !data.admission) return;
    const candidate = (data.children || []).find((child) => child && child.public_key);
    if (!candidate || !data.publication) return;
    this.receiveJoin({
      publicationId: data.publication.id || this.route.publicationId,
      state: 'ready',
      contact: candidate.public_key,
      publication: data.publication
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
    this.tracksListed = true;
    this.paint();
    this.sendSubscribe();
  }

  receiveEnded(data) {
    if (this.closed || data?.publicationId !== this.route.publicationId) return;
    this.finish('ended');
  }

  applyPublication(publication) {
    this.publication = publication;
    const captured = publication?.show === 'interface';
    const holder = document.querySelector('.swarmcast-outputs');
    if (holder?.dataset) holder.dataset.show = captured ? 'interface' : 'participants';
    const ids = new Set((publication.outputs || []).map((output) => output.id));
    for (const output of publication.outputs || []) {
      if (output.role === 'audio') this.ensureAudio(output);
      else if (output.kind === 'interface') this.ensureInterface(output);
      else this.ensureOutput(output);
    }
    for (const id of [...this.elements.keys()]) {
      if (!ids.has(id)) this.removeOutput(id);
    }
    for (const id of [...this.audio.keys()]) {
      if (!ids.has(id)) this.removeAudio(id);
    }
    if (!this.entered) this.considerReady();
    else this.refreshEntry();
    this.arrange();
  }

  ensureInterface(output) {
    this.ensureSurface(output, 'swarmcast-interface');
  }

  ensureOutput(output) {
    if (typeof document?.getElementById !== 'function') {
      if (this.elements.has(output.id)) {
        const box = this.elements.get(output.id);
        if (box?.dataset) box.dataset.camera = output.camera || 'live';
        return;
      }
      this.ensureSurface(output, 'videobox swarmcast-output');
      const box = this.elements.get(output.id);
      if (box?.dataset) box.dataset.camera = output.camera || 'live';
      return;
    }
    if (this.tiles.has(output.id)) {
      const tile = this.tiles.get(output.id);
      tile.render(this.media.get(output.id));
      if (output.camera === 'disabled') tile.toggleMask(false);
      else tile.toggleMask(true);
      return;
    }
    const stream = new MediaStream();
    const tile = new VideoBox(this.app, this.mod, output.participant || output.id, '', this.outputHolder());
    tile.video_class = 'swarmcast-video';
    tile.render(stream);
    const box = document.getElementById(`stream_${tile.stream_id}`);
    if (box) {
      box.dataset.output = output.id;
      box.classList?.remove?.('videocall-panel');
      box.classList?.add?.('swarmcast-tile');
      this.bindTile(output.id, box);
    }
    this.tiles.set(output.id, tile);
    this.elements.set(output.id, box || document.createElement('div'));
    this.media.set(output.id, stream);
    this.muteVideo(output.id);
    if (output.camera === 'disabled') tile.toggleMask(false);
  }

  outputHolder() {
    return document.querySelector('.swarmcast-outputs');
  }

  ensureAudio(output) {
    const existing = this.audio.get(output.id);
    if (existing) {
      existing.output = output;
      return;
    }
    const stream = new MediaStream();
    const element = document.createElement('audio');
    element.dataset.output = output.id;
    element.autoplay = false;
    element.muted = !!this.muted;
    document.querySelector('.swarmcast-audio')?.appendChild(element);
    this.audio.set(output.id, { element, stream, output });
    this.media.set(output.id, stream);
  }

  removeAudio(id) {
    const item = this.audio.get(id);
    this.stopElement(item?.element);
    item?.element?.remove?.();
    this.audio.delete(id);
    this.media.delete(id);
    this.midMap.delete(id);
  }

  playAudio(id) {
    const item = this.audio.get(id);
    if (!item || item.output?.muted || !this.entered || item.playing || item.starting) return;
    const element = item.element;
    element.muted = !!this.muted;
    element.srcObject = item.stream;
    item.starting = true;
    let pending = null;
    try {
      pending = element.play?.();
    } catch (err) {
      item.starting = false;
      this.notePlayRejected(id, err);
      return;
    }
    pending?.then?.(
      () => {
        item.starting = false;
        item.playing = true;
        console.info('SWARMCAST MEDIA TRACE', 'audio playing', id);
      },
      (err) => {
        item.starting = false;
        item.playing = false;
        this.notePlayRejected(id, err);
      }
    );
  }

  ensureSurface(output, className) {
    if (this.elements.has(output.id)) return;
    const box = document.createElement('div');
    box.className = className;
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
    if (this.audio.has(`${id}:audio`)) this.removeAudio(`${id}:audio`);
    this.stopElement(this.elements.get(id)?.querySelector?.('video'));
    this.tiles.get(id)?.destroy?.();
    this.tiles.delete(id);
    this.elements.get(id)?.remove?.();
    this.elements.delete(id);
    this.media.delete(id);
    this.midMap.delete(id);
    this.playback?.delete(id);
    this.playbackTrack?.delete(id);
    this.arrange();
  }

  paint() {
    let playing = false;
    let attached = 0;
    for (const [id, stream] of this.media) {
      const accepts = this.audio.has(id) ? 'audio' : 'video';
      const wanted = new Set((this.midMap.get(id) || []).map((item) => item.mid));
      for (const mid of wanted) {
        const track = this.pending.get(mid);
        if (!track || track.readyState === 'ended') continue;
        if (accepts === 'video' && track.kind === 'audio') {
          this.attachTrack(this.audioSink(id), track, mid);
          continue;
        }
        if (track.kind !== accepts) continue;
        this.attachTrack(id, track, mid);
      }
      for (const track of stream.getTracks()) {
        const mid = this.trackMids.get(track);
        if (!mid || !wanted.has(mid) || track.readyState === 'ended' || track.kind !== accepts) {
          stream.removeTrack(track);
          if (this.trackOwner.get(track) === id) this.trackOwner.delete(track);
        }
      }
      if (accepts === 'video') this.pruneSink(id, wanted);
      const count = stream.getTracks().length;
      attached += count;
      if (count) {
        playing = true;
        if (this.entered) {
          if (this.audio.has(id)) this.playAudio(id);
          else this.playOutput(id);
        }
      } else if (this.entered && accepts === 'video') {
        this.playback.delete(id);
        this.playbackTrack.delete(id);
      }
    }
    console.info('SWARMCAST MEDIA TRACE', 'paint', 'attached', attached);
    if (this.state === 'ended' || this.state === 'unavailable' || this.state === 'interrupted') {
      this.refreshEntry();
      return;
    }
    if (this.entered) {
      if (playing) this.mark('playing');
      else if (this.contact) this.mark('waiting');
      return;
    }
    this.considerReady();
  }

  pruneSink(id, wanted) {
    const sink = `${id}:audio`;
    const stream = this.media.get(sink);
    if (!stream) return;
    for (const track of stream.getTracks()) {
      const mid = this.trackMids.get(track);
      if (!mid || !wanted.has(mid) || track.readyState === 'ended') {
        stream.removeTrack(track);
        if (this.trackOwner.get(track) === sink) this.trackOwner.delete(track);
        this.midMap.set(sink, (this.midMap.get(sink) || []).filter((item) => item.mid !== mid));
      }
    }
  }

  audioSink(id) {
    const key = `${id}:audio`;
    if (!this.audio.has(key)) this.ensureAudio({ id: key, role: 'audio', label: id, muted: false });
    return key;
  }

  attachTrack(id, track, mid) {
    if (this.trackOwner.get(track) && this.trackOwner.get(track) !== id) return;
    const stream = this.media.get(id);
    if (!stream) return;
    if (!stream.getTracks().includes(track)) stream.addTrack(track);
    this.trackOwner.set(track, id);
    if (!this.midMap.get(id)?.some((item) => item.mid === mid)) {
      const list = this.midMap.get(id) || [];
      list.push({ mid, kind: track.kind });
      this.midMap.set(id, list);
    }
  }

  liveVideoTrack(id) {
    return (this.media.get(id)?.getVideoTracks?.() || []).find((track) => track.readyState !== 'ended') || null;
  }

  muteVideo(id) {
    const video = this.elements.get(id)?.querySelector('video');
    if (!video) return null;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    this.watchVideo(id, video);
    return video;
  }

  watchVideo(id, video) {
    if (!video || this.videoWatch.has(video)) return;
    this.videoWatch.add(video);
    for (const name of ['loadedmetadata', 'loadeddata', 'playing', 'waiting', 'stalled', 'error']) {
      video.addEventListener?.(name, () => {
        this.traceVideo(id, name);
        if (name === 'waiting' || name === 'stalled' || name === 'loadedmetadata') this.sampleInbound(id, name);
      });
    }
  }

  traceVideo(id, phase) {
    const video = this.elements.get(id)?.querySelector?.('video');
    const track = this.liveVideoTrack(id);
    const srcIds = (this.media.get(id)?.getVideoTracks?.() || []).map((item) => item.id);
    let box = null;
    try {
      box = video?.getBoundingClientRect?.() || null;
    } catch (err) {
      box = null;
    }
    const style = video && typeof getComputedStyle === 'function' ? getComputedStyle(video) : null;
    pipelineTrace('viewer', 'element', {
      publication: this.route?.publicationId || 'none',
      broadcaster: this.contact || 'none',
      output: id,
      phase,
      track: track?.id || 'none',
      mid: track ? this.trackMids.get(track) || 'unavailable' : 'unavailable',
      kind: track?.kind || 'none',
      readyState: track?.readyState || 'none',
      enabled: track ? track.enabled : 'unavailable',
      muted: track ? track.muted : 'unavailable',
      srcObject: srcIds.length ? srcIds : 'none',
      expectedTrackPresent: !!(track && srcIds.includes(track.id)),
      paused: video ? video.paused : 'unavailable',
      mediaReady: video ? video.readyState : 'unavailable',
      videoWidth: video ? reported({ videoWidth: video.videoWidth }, 'videoWidth') : 'unavailable',
      videoHeight: video ? reported({ videoHeight: video.videoHeight }, 'videoHeight') : 'unavailable',
      currentTime: video ? reported({ currentTime: video.currentTime }, 'currentTime') : 'unavailable',
      rendered: box ? { width: Math.round(box.width), height: Math.round(box.height) } : 'unavailable',
      display: style?.display || 'unknown',
      visibility: style?.visibility || 'unknown'
    });
  }

  receiverFor(pc, track, mid) {
    const receivers = typeof pc?.getReceivers === 'function' ? pc.getReceivers() : [];
    const direct = receivers.find((receiver) => receiver.track === track);
    if (direct) return direct;
    return (pc?.getTransceivers?.() || []).find((entry) => mid && String(entry.mid) === String(mid))?.receiver || null;
  }

  sampleInbound(id, phase = 'once') {
    const pc = this.mod.peerManager?.peers?.get?.(this.contact);
    const key = `${id}:${phase}`;
    if (this.statsSampled?.has(key)) return Promise.resolve();
    this.statsSampled ??= new Set();
    this.statsSampled.add(key);
    const track = this.liveVideoTrack(id);
    const mid = track ? this.trackMids.get(track) : null;
    const video = this.elements.get(id)?.querySelector?.('video');
    const base = {
      publication: this.route?.publicationId || 'none',
      broadcaster: this.contact || 'none',
      viewer: this.mod.publicKey || 'none',
      output: id,
      track: track?.id || 'none',
      mid: mid || 'unavailable',
      phase,
      paused: video ? video.paused : 'unavailable',
      mediaReady: video ? video.readyState : 'unavailable',
      videoWidth: video ? reported({ videoWidth: video.videoWidth }, 'videoWidth') : 'unavailable',
      videoHeight: video ? reported({ videoHeight: video.videoHeight }, 'videoHeight') : 'unavailable'
    };
    if (!track) {
      pipelineTrace('viewer', 'inbound', { ...base, matched: false, reason: 'no interface video track' });
      return Promise.resolve();
    }
    const receiver = this.receiverFor(pc, track, mid);
    const scoped = typeof receiver?.getStats === 'function';
    const read = scoped ? receiver.getStats() : (typeof pc?.getStats === 'function' ? pc.getStats() : null);
    if (!read) {
      pipelineTrace('viewer', 'inbound', { ...base, matched: false, reason: 'statistics unavailable' });
      return Promise.resolve();
    }
    const pending = Promise.resolve(read).then((stats) => {
      const fields = selectRtpReport(stats, {
        type: 'inbound-rtp',
        kind: 'video',
        mid,
        trackId: track.id,
        scoped
      });
      const history = this.inboundHistory ||= new Map();
      const samples = history.get(id) || [];
      const previous = samples.length ? samples[samples.length - 1] : null;
      samples.push(fields);
      history.set(id, samples);
      pipelineTrace('viewer', 'inbound', {
        ...base,
        receiverTrack: receiver?.track?.id || 'unavailable',
        ...fields,
        ...(previous ? { delta: compareCounters(previous, fields) } : {})
      });
      if (previous) this.summarizeViewer(id, previous, fields);
    }).catch((err) => {
      pipelineTrace('viewer', 'inbound', { ...base, matched: false, reason: err?.name || 'statistics failed' });
    });
    if (phase === 'waiting' && !this.inboundFollowup?.has(id)) {
      this.inboundFollowup ??= new Set();
      this.inboundFollowup.add(id);
      const timer = setTimeout(() => {
        if (!this.closed) this.sampleInbound(id, 'waiting-followup');
      }, 2000);
      timer.unref?.();
    }
    return pending;
  }

  summarizeViewer(id, before, after) {
    const video = this.elements.get(id)?.querySelector?.('video');
    let reception = interpretMedia('inbound', before, after);
    if (reception === 'frames decoded' && !(video?.videoWidth > 0)) reception = 'decoded frames but no rendered picture';
    else if (reception === 'frames decoded' && video?.videoWidth > 0) reception = 'rendered';
    pipelineTrace('viewer', 'summary', {
      publication: this.route?.publicationId || 'none',
      broadcaster: this.contact || 'none',
      viewer: this.mod.publicKey || 'none',
      output: id,
      track: this.liveVideoTrack(id)?.id || 'none',
      mid: after?.matched ? this.trackMids.get(this.liveVideoTrack(id)) || 'unavailable' : 'unavailable',
      ssrc: after?.ssrc || 'unavailable',
      codec: after?.codec || 'unavailable',
      reception,
      mediaReady: video ? video.readyState : 'unavailable',
      videoWidth: video ? reported({ videoWidth: video.videoWidth }, 'videoWidth') : 'unavailable',
      videoHeight: video ? reported({ videoHeight: video.videoHeight }, 'videoHeight') : 'unavailable'
    });
  }

  playOutput(id) {
    const video = this.muteVideo(id);
    const track = this.liveVideoTrack(id);
    if (!video) {
      console.info('SWARMCAST MEDIA TRACE', 'play unavailable', id, 'no element');
      return;
    }
    if (!track) {
      this.playback.delete(id);
      this.playbackTrack.delete(id);
      console.info('SWARMCAST MEDIA TRACE', 'video', 'waiting for track', id);
      return;
    }
    if (this.playbackTrack.get(id) === track.id && video.paused === false) return;
    this.playback.add(id);
    this.playbackTrack.set(id, track.id);
    const stream = this.media.get(id);
    video.srcObject = null;
    video.srcObject = stream;
    this.traceVideo(id, 'play');
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => {
        this.traceVideo(id, 'frame');
        this.sampleInbound(id);
      });
    }
    let pending = null;
    try {
      pending = typeof video.play === 'function' ? video.play() : null;
    } catch (err) {
      this.notePlayRejected(id, err);
      return;
    }
    if (!pending?.then) {
      console.info('SWARMCAST MEDIA TRACE', 'play unavailable', id);
      return;
    }
    pending.then(
      () => {
        console.info('SWARMCAST MEDIA TRACE', 'play resolved', id);
        this.traceVideo(id, 'playing');
        this.sampleInbound(id);
      },
      (err) => this.notePlayRejected(id, err)
    );
  }

  notePlayRejected(id, err) {
    this.playback.delete(id);
    this.playbackTrack.delete(id);
    this.playbackBlocked = true;
    console.info('SWARMCAST MEDIA TRACE', 'play rejected', id, err?.name || err);
    this.traceVideo(id, 'rejected');
    this.refreshEntry();
  }

  broadcastReady() {
    return !!(this.publication && this.subscribed && this.tracksListed && this.attachedCount() > 0);
  }

  attachedCount() {
    let count = 0;
    for (const stream of this.media.values()) {
      count += stream.getTracks().filter((track) => track.readyState !== 'ended').length;
    }
    return count;
  }

  participantGroups() {
    const groups = [];
    const seen = new Set();
    for (const output of this.publication?.outputs || []) {
      const key = output.participant || output.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const related = this.publication.outputs.filter((item) => (item.participant || item.id) === key);
      const name = output.kind === 'interface' ? output.label || 'the call' : output.label || 'participant';
      groups.push({
        key,
        name,
        label: output.kind === 'interface' ? 'Receiving the call' : `Connecting to ${name}`,
        done: related.some((item) => this.outputHasMedia(item))
      });
    }
    return groups;
  }

  outputHasMedia(output) {
    return !!this.media.get(output.id)?.getTracks().some((track) => track.readyState !== 'ended');
  }

  steps() {
    const connected = !!(this.contact && this.mod.peerManager?.hasConnectionWithPeer?.(this.contact));
    const steps = [
      { label: 'Connecting to broadcaster', done: connected },
      { label: 'Subscribing to broadcast', done: !!(this.subscribed && this.tracksListed) }
    ];
    for (const group of this.participantGroups()) steps.push(group);
    if (this.publication) {
      steps.push({ label: 'Receiving video and audio', done: this.attachedCount() > 0 });
    }
    return steps;
  }

  considerReady() {
    if (this.entered) return;
    if (['unavailable', 'interrupted', 'ended'].includes(this.state)) this.entry = 'failed';
    else this.entry = this.broadcastReady() ? 'ready' : 'connecting';
    this.refreshEntry();
  }

  enter() {
    if (this.entry !== 'ready' || this.entered) return;
    this.entry = 'entering';
    this.entered = true;
    this.playbackBlocked = false;
    this.entry = 'viewing';
    this.refreshEntry();
    this.startPlayback();
    this.mark('playing');
  }

  retryPlayback() {
    if (!this.entered) return;
    this.playbackBlocked = false;
    this.startPlayback();
    this.refreshEntry();
  }

  startPlayback() {
    for (const id of this.media.keys()) {
      if (this.audio.has(id)) this.playAudio(id);
      else this.playOutput(id);
    }
  }

  refreshEntry() {
    const root = document.querySelector('.swarmcast-viewer');
    if (root?.dataset) root.dataset.entry = this.entry;
    const title = document.querySelector('.swarmcast-entry-title');
    if (title) {
      title.textContent = this.entry === 'ready'
        ? 'The broadcast is ready'
        : this.entry === 'failed'
          ? 'The broadcast is unavailable'
          : 'Joining the broadcast';
    }
    const progress = document.querySelector('.swarmcast-entry-progress');
    if (progress) {
      progress.textContent = '';
      if (Array.isArray(progress.children)) progress.children.length = 0;
      for (const step of this.steps()) {
        const item = document.createElement('li');
        item.dataset.done = step.done ? 'yes' : 'no';
        item.textContent = step.label;
        progress.appendChild?.(item);
      }
    }
    const waiting = this.participantGroups().filter((group) => !group.done);
    const pending = document.querySelector('.swarmcast-entry-pending');
    if (pending) {
      pending.hidden = this.entry !== 'ready' || !waiting.length;
      pending.textContent = waiting.map((group) => `${group.name} is still connecting`).join(' ');
    }
    const welcome = document.querySelector('.swarmcast-entry-welcome');
    if (welcome) welcome.hidden = this.entry !== 'ready';
    const enter = document.querySelector('.swarmcast-entry-enter');
    if (enter) enter.onclick = () => this.enter();
    const error = document.querySelector('.swarmcast-entry-error');
    if (error) error.hidden = this.entry !== 'failed';
    const errorText = document.querySelector('.swarmcast-entry-error-text');
    if (errorText) errorText.textContent = this.entry === 'failed' ? this.detail || '' : '';
    const stage = document.querySelector('.swarmcast-stage');
    if (stage) stage.hidden = this.entry !== 'viewing';
    const href = globalThis.window?.location?.href || '';
    const share = document.querySelector('.swarmcast-transcript-link');
    if (share) {
      share.href = href;
      if (!share.querySelector?.('i')) share.textContent = href;
      share.hidden = this.entry !== 'viewing' || !href;
    }
    const field = document.querySelector('.swarmcast-share-field');
    if (field) {
      field.value = href;
      field.title = href;
    }
    const retry = document.querySelector('.swarmcast-playback-retry');
    if (retry) {
      retry.hidden = !(this.entry === 'viewing' && this.playbackBlocked);
      retry.onclick = () => this.retryPlayback();
    }
    this.arrange();
  }

  visibleIds() {
    return (this.publication?.outputs || [])
      .filter((output) => output.role !== 'audio')
      .map((output) => output.id)
      .filter((id) => this.elements.has(id));
  }

  syncOrder(ids) {
    if (!this.customOrder) {
      this.order = ids.slice();
      return;
    }
    this.order = this.order.filter((id) => ids.includes(id));
    for (const id of ids) {
      if (!this.order.includes(id)) this.order.push(id);
    }
    if (this.focusId && !ids.includes(this.focusId)) this.focusId = null;
    for (const id of Object.keys(this.sizes)) {
      if (!ids.includes(id)) delete this.sizes[id];
    }
  }

  stageBox() {
    const view = typeof document !== 'undefined' ? document.querySelector?.('.swarmcast-view') : null;
    return {
      width: Number(view?.clientWidth) || this.stageWidth || 1280,
      height: Number(view?.clientHeight) || this.stageHeight || 720
    };
  }

  arrange() {
    const ids = this.visibleIds();
    this.syncOrder(ids);
    const stage = this.stageBox();
    const featured = this.focusId && ids.includes(this.focusId) ? this.focusId : this.order[0];
    const fit = arrangeTiles(Math.max(ids.length, 1), stage.width, stage.height, this.layout);
    const mainWidth = Math.max(160, stage.width * this.split - 16);
    const sideWidth = Math.max(120, stage.width * (1 - this.split) - 16);
    const main = arrangeTiles(1, mainWidth, stage.height, 'focus');
    const side = arrangeTiles(Math.max(ids.length - 1, 1), sideWidth, stage.height, 'grid');
    this.lastFit = {
      ...fit,
      count: ids.length,
      mode: this.layout,
      width: stage.width,
      height: stage.height,
      focus: featured || null,
      main,
      side
    };
    this.noteFeeds(ids.length);
    const holder = this.outputHolder();
    if (!holder?.style?.setProperty) return this.lastFit;
    holder.dataset.layout = this.layout;
    holder.dataset.count = String(ids.length);
    holder.style.setProperty('--swarmcast-tile-w', `${Math.round(fit.tileWidth)}px`);
    holder.style.setProperty('--swarmcast-tile-h', `${Math.round(fit.tileHeight)}px`);
    holder.style.setProperty('--swarmcast-split', `${Math.round(this.split * 100)}%`);
    for (const id of this.order) {
      const box = this.elements.get(id);
      if (!box?.style) continue;
      const role = this.layout === 'focus' && id === featured ? 'focus' : 'side';
      if (box.dataset) box.dataset.role = this.layout === 'focus' ? role : '';
      const base = this.layout === 'focus' ? (role === 'focus' ? main.tileWidth : side.tileWidth) : fit.tileWidth;
      const width = this.sizes[id] || base;
      box.style.width = width ? `${Math.round(width)}px` : '';
      box.style.height = width ? `${Math.round(width / ASPECT)}px` : '';
    }
    this.orderElements(holder);
    return this.lastFit;
  }

  orderElements(holder) {
    if (typeof holder.insertBefore !== 'function') return;
    for (const id of this.order) {
      const box = this.elements.get(id);
      if (box) holder.insertBefore(box, null);
    }
  }

  setLayout(mode) {
    if (!['auto', 'grid', 'focus'].includes(mode)) return;
    this.layout = mode;
    this.arrange();
    this.paintToolbar();
  }

  moveTile(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const order = this.order.slice();
    const from = order.indexOf(fromId);
    const to = order.indexOf(toId);
    if (from < 0 || to < 0) return;
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    this.order = order;
    this.customOrder = true;
    this.arrange();
  }

  setTileSize(id, width) {
    if (!this.elements.has(id)) return;
    this.sizes[id] = Math.max(160, Math.min(Number(width) || 0, 1600));
    this.arrange();
  }

  setSplit(ratio) {
    this.split = Math.min(0.85, Math.max(0.45, Number(ratio) || 0.7));
    this.arrange();
  }

  resetLayout() {
    this.layout = 'auto';
    this.customOrder = false;
    this.sizes = {};
    this.split = 0.7;
    this.focusId = null;
    this.arrange();
    this.paintToolbar();
  }

  setMuted(muted) {
    this.muted = !!muted;
    for (const item of this.audio.values()) {
      if (item?.element) item.element.muted = this.muted;
    }
    this.paintToolbar();
  }

  toggleFullscreen() {
    const stage = typeof document !== 'undefined' ? document.querySelector('.swarmcast-stage') : null;
    const active = typeof document !== 'undefined' ? document.fullscreenElement : null;
    if (active) {
      document.exitFullscreen?.();
      return;
    }
    stage?.requestFullscreen?.();
  }

  leave() {
    const history = globalThis.window?.history;
    this.destroy();
    document.querySelector?.('.swarmcast-viewer')?.remove?.();
    if (history?.length > 1) history.back?.();
  }

  bindToolbar() {
    const root = document.querySelector('.swarmcast-toolbar');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = 'yes';
    root.querySelector('.swarmcast-mute')?.addEventListener('click', () => {
      this.setMuted(!this.muted);
    });
    for (const button of root.querySelectorAll('.swarmcast-layout')) {
      button.addEventListener('click', () => this.setLayout(button.dataset.layout));
    }
    root.querySelector('.swarmcast-fullscreen')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
    root.querySelector('.swarmcast-leave')?.addEventListener('click', () => this.leave());
    this.paintToolbar();
  }

  bindShare() {
    const copy = document.querySelector('.swarmcast-share-copy');
    if (!copy?.addEventListener || copy.dataset.bound) return;
    copy.dataset.bound = 'yes';
    copy.addEventListener('click', () => this.copyShareLink());
  }

  copyShareLink() {
    const field = document.querySelector('.swarmcast-share-field');
    const href = field?.value || document.querySelector('.swarmcast-transcript-link')?.href || '';
    const button = document.querySelector('.swarmcast-share-copy');
    const markCopied = () => {
      if (!button) return;
      button.dataset.copied = 'yes';
      button.setAttribute?.('aria-label', 'Link copied');
    };
    const write = globalThis.navigator?.clipboard?.writeText?.(href);
    if (write?.then) return write.then(markCopied).catch((err) => console.error(err));
    markCopied();
    return Promise.resolve();
  }

  noteFeeds(count) {
    const node = typeof document !== 'undefined' ? document.querySelector('.swarmcast-feed-count') : null;
    if (!node) return;
    node.textContent = `${count} ${count === 1 ? 'feed' : 'feeds'}`;
  }

  paintToolbar() {
    const root = typeof document !== 'undefined' ? document.querySelector('.swarmcast-toolbar') : null;
    if (!root?.querySelector) return;
    const mute = root.querySelector('.swarmcast-mute');
    if (mute) {
      mute.setAttribute?.('aria-pressed', this.muted ? 'true' : 'false');
      const icon = mute.querySelector?.('i');
      icon?.classList?.toggle?.('fa-volume-high', !this.muted);
      icon?.classList?.toggle?.('fa-volume-xmark', this.muted);
      const label = mute.querySelector?.('span');
      if (label) label.textContent = this.muted ? 'Unmute' : 'Mute';
    }
    for (const button of root.querySelectorAll('.swarmcast-layout')) {
      button.setAttribute?.('aria-pressed', button.dataset.layout === this.layout ? 'true' : 'false');
    }
  }

  bindTile(id, box) {
    if (!box?.addEventListener || box.dataset.tileBound) return;
    box.dataset.tileBound = 'yes';
    box.draggable = true;
    box.addEventListener('dragstart', () => {
      this.dragId = id;
    });
    box.addEventListener('dragover', (event) => event.preventDefault?.());
    box.addEventListener('drop', () => this.moveTile(this.dragId, id));
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'swarmcast-resize';
    grip.setAttribute('aria-label', 'Resize video');
    grip.addEventListener('pointerdown', (event) => this.beginResize(id, event));
    box.appendChild?.(grip);
  }

  beginResize(id, event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    const startX = event.clientX || 0;
    const start = this.sizes[id] || this.lastFit?.tileWidth || 320;
    const move = (pointer) => {
      this.setTileSize(id, start + ((pointer.clientX || 0) - startX));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  watchStage() {
    const view = document.querySelector('.swarmcast-view');
    if (!view || typeof ResizeObserver !== 'function') {
      window.addEventListener?.('resize', () => this.arrange());
      return;
    }
    this.stageObserver = new ResizeObserver(() => this.arrange());
    this.stageObserver.observe(view);
  }

  stopElement(element) {
    if (!element) return;
    try {
      element.pause?.();
    } catch (err) {
      /* already stopped */
    }
    element.srcObject = null;
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
    if (this.closed || !this.contact || !this.publication || !connected) {
      const reason = this.closed
        ? 'closed'
        : !this.contact
          ? 'no contact'
          : !this.publication
            ? 'no publication'
            : 'no peer connection';
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
    if (this.entered) this.mark(this.state === 'playing' ? 'playing' : 'waiting');
    else this.considerReady();
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
    this.app.connection.removeListener?.('stun-connection-connected', this.onConnected);
    this.app.connection.removeListener?.('stun-data-channel-close', this.onChannelClose);
    window.removeEventListener('beforeunload', this.onLeave);
    this.stageObserver?.disconnect?.();
    if (this.contact) this.mod.peerManager?.removePeerConnection?.(this.contact);
    for (const id of [...this.elements.keys()]) this.removeOutput(id);
    for (const id of [...this.audio.keys()]) this.removeAudio(id);
    this.pending.clear();
    this.trackMids.clear();
    this.trackOwner?.clear();
  }
}

module.exports = SwarmcastViewer;
