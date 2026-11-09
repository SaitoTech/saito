/**
 * One visual and audio composition.
 *
 * `update({ composition })` replaces only the composition fields it includes:
 * `layers`, `audio`, and `background`. `update({ settings })` replaces only
 * the setting fields it includes. A layer list or an audio list, when
 * present, replaces that whole list.
 *
 * `start` creates the output MediaStream. While running, that object and its
 * video and audio tracks stay in place across layout, input, frame-rate, and
 * canvas-size changes. `sampleRate` is fixed by the AudioContext and a change
 * while running is rejected. `stop` stops only the output tracks. The next
 * `start` creates a new MediaStream.
 *
 * Input entries are borrowed. Nothing here calls `stop` on them.
 */

const ADDED = 'videocall-stream-added';
const UPDATED = 'videocall-stream-updated';
const REMOVED = 'videocall-stream-removed';

const imageLoads = new Map();

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function loadImage(src) {
  const cached = imageLoads.get(src);
  if (cached) return cached;
  const pending = new Promise((resolve, reject) => {
    if (typeof Image !== 'function') {
      imageLoads.delete(src);
      reject(new Error('Image is unavailable'));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageLoads.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    image.src = src;
  });
  imageLoads.set(src, pending);
  return pending;
}

function layerBox(layer, width, height) {
  return {
    x: Number.isFinite(layer.x) ? layer.x : 0,
    y: Number.isFinite(layer.y) ? layer.y : 0,
    width: Number.isFinite(layer.width) ? layer.width : width,
    height: Number.isFinite(layer.height) ? layer.height : height
  };
}

function drawFitted(ctx, source, box, fit) {
  const sw = source.videoWidth || source.naturalWidth || source.width || 0;
  const sh = source.videoHeight || source.naturalHeight || source.height || 0;
  if (!sw || !sh || !box.width || !box.height || !ctx.drawImage) return;
  const scale =
    fit === 'contain' ? Math.min(box.width / sw, box.height / sh) : Math.max(box.width / sw, box.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = box.x + (box.width - dw) / 2;
  const dy = box.y + (box.height - dh) / 2;
  if (fit !== 'contain' && ctx.save && ctx.rect && ctx.clip && ctx.restore) {
    ctx.save();
    ctx.beginPath?.();
    ctx.rect(box.x, box.y, box.width, box.height);
    ctx.clip();
    ctx.drawImage(source, dx, dy, dw, dh);
    ctx.restore();
    return;
  }
  ctx.drawImage(source, dx, dy, dw, dh);
}

function cloneComposition(composition) {
  return {
    background: composition.background,
    layers: (composition.layers || []).map((layer) => ({ ...layer })),
    audio: (composition.audio || []).map((item) => ({ ...item }))
  };
}

function defaults() {
  return {
    composition: { background: '#000000', layers: [], audio: [] },
    settings: {
      video: { width: 1280, height: 720, frameRate: 30 },
      audio: { sampleRate: 48000 }
    }
  };
}

class StreamComposer {
  constructor(streams, config = {}) {
    if (!streams || typeof streams.get !== 'function') {
      throw new Error('StreamComposer requires a StreamManager');
    }
    this.streams = streams;
    this.id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const initial = defaults();
    this._apply(initial, config);
    this._validate(initial);
    this.composition = initial.composition;
    this.settings = initial.settings;

    this._state = 'idle';
    this._output = null;
    this._videoTrack = null;
    this._audioTrack = null;
    this._published = '';
    this._imageErrors = new Map();
    this._decoded = new Map();
    this._resetRuntime();
  }

  get output() {
    return this._output;
  }

  get status() {
    const samples = this._samples || [];
    const average = samples.length
      ? samples.reduce((sum, value) => sum + value, 0) / samples.length
      : 0;
    this._frameTimes = (this._frameTimes || []).filter((time) => nowMs() - time <= 1000);
    const recent = this._frameTimes;
    return {
      state: this._state,
      missing: this._missing(),
      errors: this._errors(),
      diagnostics: {
        frames: this._diagnostics.frames,
        averageComposeMs: average,
        maxComposeMs: samples.length ? Math.max(...samples) : 0,
        skipped: this._diagnostics.skipped,
        frameRate: recent.length,
        visualInputs: this._videos.size,
        audioInputs: this._audioNodes.size
      }
    };
  }

  start() {
    if (this._state === 'running') return this._output;
    this._validate({ composition: this.composition, settings: this.settings });
    try {
      this._openPipeline();
      this._state = 'running';
      this._listen();
      this._syncInputs();
      this._resolveImages();
      this._staticDirty = true;
      this._needsFrame = true;
      this._arm();
      this._publish();
      return this._output;
    } catch (err) {
      this._releaseOwned();
      this._state = 'idle';
      throw err;
    }
  }

  update(config = {}) {
    const next = {
      composition: cloneComposition(this.composition),
      settings: {
        video: { ...this.settings.video },
        audio: { ...this.settings.audio }
      }
    };
    this._apply(next, config);
    this._validate(next);
    if (
      this._state === 'running' &&
      next.settings.audio.sampleRate !== this.settings.audio.sampleRate
    ) {
      this._sampleRateRejected = true;
      next.settings.audio.sampleRate = this.settings.audio.sampleRate;
    } else {
      this._sampleRateRejected = false;
    }
    const sizeChanged =
      next.settings.video.width !== this.settings.video.width ||
      next.settings.video.height !== this.settings.video.height;
    const pictureChanged =
      sizeChanged ||
      (config.composition != null &&
        ('layers' in config.composition || 'background' in config.composition));
    this.composition = next.composition;
    this.settings = next.settings;
    if (this._state !== 'running') {
      this._publish();
      return;
    }
    if (sizeChanged) this._resize();
    this._syncInputs();
    if (config.composition && 'layers' in config.composition) this._resolveImages();
    if (pictureChanged) {
      this._staticDirty = true;
      this._needsFrame = true;
      this._arm();
    }
    this._publish();
  }

  stop() {
    if (this._state === 'idle') {
      this._state = 'stopped';
      this._publish();
      return;
    }
    this._releaseOwned();
    this._state = 'stopped';
    this._publish();
  }

  _apply(target, config) {
    if (config == null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('StreamComposer config must be an object');
    }
    if (config.composition != null) {
      if (typeof config.composition !== 'object' || Array.isArray(config.composition)) {
        throw new Error('composition must be an object');
      }
      if ('background' in config.composition) target.composition.background = config.composition.background;
      if ('layers' in config.composition) {
        if (!Array.isArray(config.composition.layers)) throw new Error('composition.layers must be an array');
        target.composition.layers = config.composition.layers.map((layer) => ({ ...layer }));
      }
      if ('audio' in config.composition) {
        if (!Array.isArray(config.composition.audio)) throw new Error('composition.audio must be an array');
        target.composition.audio = config.composition.audio.map((item) => ({ ...item }));
      }
    }
    if (config.settings != null) {
      if (typeof config.settings !== 'object' || Array.isArray(config.settings)) {
        throw new Error('settings must be an object');
      }
      if (config.settings.video) {
        for (const key of ['width', 'height', 'frameRate']) {
          if (key in config.settings.video) target.settings.video[key] = config.settings.video[key];
        }
      }
      if (config.settings.audio && 'sampleRate' in config.settings.audio) {
        target.settings.audio.sampleRate = config.settings.audio.sampleRate;
      }
    }
  }

  _validate(config) {
    const { width, height, frameRate } = config.settings.video;
    if (![width, height, frameRate, config.settings.audio.sampleRate].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error('Video size, frame rate, and sample rate must be positive numbers');
    }
    for (const layer of config.composition.layers) {
      if (layer.type === 'stream') {
        if (!layer.id) throw new Error('A stream layer requires an id');
      } else if (layer.type === 'image') {
        if (!layer.src && !layer.image) throw new Error('An image layer requires a src or an image');
      } else {
        throw new Error(`Unknown layer type ${layer.type}`);
      }
      if (layer.fit && layer.fit !== 'cover' && layer.fit !== 'contain') {
        throw new Error('fit must be cover or contain');
      }
    }
    for (const item of config.composition.audio) {
      if (!item.id) throw new Error('An audio input requires an id');
      if (item.gain != null && (!Number.isFinite(item.gain) || item.gain < 0)) {
        throw new Error('Audio gain must be a non-negative number');
      }
    }
  }

  _resetRuntime() {
    this._videos = new Map();
    this._audioNodes = new Map();
    this._trackListeners = [];
    this._samples = [];
    this._frameTimes = [];
    this._diagnostics = { frames: 0, skipped: 0 };
    this._pendingSignals = 0;
    this._staticDirty = false;
    this._needsFrame = false;
    this._videoDirty = false;
    this._timer = null;
    this._fallbackHandle = null;
    this._nextFrame = 0;
    this._sampleRateRejected = false;
    this._renderMessage = '';
    this._audioErrors = new Map();
    this._canvas = null;
    this._ctx = null;
    this._staticCanvas = null;
    this._staticCtx = null;
    this._audioContext = null;
    this._destination = null;
    this._sink = null;
  }

  _openPipeline() {
    if (typeof document === 'undefined' || !document.createElement) {
      throw new Error('StreamComposer requires a document');
    }
    this._resetRuntime();
    const { width, height } = this.settings.video;
    this._sink = document.createElement('div');
    if (this._sink.style) {
      this._sink.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none';
    }
    document.body?.appendChild?.(this._sink);

    this._canvas = document.createElement('canvas');
    this._canvas.width = width;
    this._canvas.height = height;
    this._ctx = this._canvas.getContext('2d');
    if (!this._ctx) throw new Error('Canvas 2D is unavailable');
    this._staticCanvas = document.createElement('canvas');
    this._staticCanvas.width = width;
    this._staticCanvas.height = height;
    this._staticCtx = this._staticCanvas.getContext('2d');

    if (typeof this._canvas.captureStream !== 'function') {
      throw new Error('canvas.captureStream is unavailable');
    }
    const captured = this._canvas.captureStream(0);
    this._videoTrack = captured.getVideoTracks()[0];
    if (!this._videoTrack) throw new Error('Canvas capture produced no video track');

    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof AudioCtx !== 'function') throw new Error('AudioContext is unavailable');
    this._audioContext = new AudioCtx({ sampleRate: this.settings.audio.sampleRate });
    this._destination = this._audioContext.createMediaStreamDestination();
    this._audioTrack = this._destination.stream.getAudioTracks()[0];
    if (!this._audioTrack) throw new Error('Audio mix produced no audio track');

    const Stream = globalThis.MediaStream;
    this._output = typeof Stream === 'function' ? new Stream() : { _tracks: [], addTrack(track) { this._tracks.push(track); }, getTracks() { return this._tracks; }, getAudioTracks() { return this._tracks.filter((track) => track.kind === 'audio'); }, getVideoTracks() { return this._tracks.filter((track) => track.kind === 'video'); } };
    this._output.addTrack(this._videoTrack);
    this._output.addTrack(this._audioTrack);
  }

  _resize() {
    const { width, height } = this.settings.video;
    this._canvas.width = width;
    this._canvas.height = height;
    this._staticCanvas.width = width;
    this._staticCanvas.height = height;
    this._staticDirty = true;
  }

  _listen() {
    const connection = this.streams.app?.connection;
    if (!connection?.on) return;
    this._onAdded = (entry) => this._onRegistry(ADDED, entry);
    this._onUpdated = (entry) => this._onRegistry(UPDATED, entry);
    this._onRemoved = (entry) => this._onRegistry(REMOVED, entry);
    connection.on(ADDED, this._onAdded);
    connection.on(UPDATED, this._onUpdated);
    connection.on(REMOVED, this._onRemoved);
  }

  _onRegistry(event, entry) {
    if (this._state !== 'running' || !entry?.id || !this._wanted().has(entry.id)) return;
    if (event === REMOVED) this._unbind(entry.id);
    else this._bind(entry.id);
    this._staticDirty = true;
    this._needsFrame = true;
    this._arm();
    this._publish();
  }

  _wanted() {
    const ids = new Set();
    for (const layer of this.composition.layers) {
      if (layer.type === 'stream' && layer.id) ids.add(layer.id);
    }
    for (const item of this.composition.audio) {
      if (item.id) ids.add(item.id);
    }
    return ids;
  }

  _syncInputs() {
    const wanted = this._wanted();
    for (const id of [...this._videos.keys(), ...this._audioNodes.keys()]) {
      if (!wanted.has(id)) this._unbind(id);
    }
    for (const id of wanted) this._bind(id);
  }

  _bind(id) {
    const entry = this.streams.get(id);
    this._clearTrackListeners(id);
    if (!entry?.mediaStream) {
      this._releaseVideo(id);
      this._releaseAudio(id);
      return;
    }
    if (this.composition.layers.some((layer) => layer.type === 'stream' && layer.id === id)) {
      this._bindVideo(id, entry.mediaStream);
    } else if (this._videos.has(id)) {
      this._releaseVideo(id);
    }
    if (this.composition.audio.some((item) => item.id === id)) {
      this._bindAudio(id, entry.mediaStream);
    } else if (this._audioNodes.has(id)) {
      this._releaseAudio(id);
    }
    this._watchTracks(id, entry.mediaStream);
  }

  _unbind(id) {
    this._clearTrackListeners(id);
    this._releaseVideo(id);
    this._releaseAudio(id);
  }

  _clearTrackListeners(id) {
    this._trackListeners = (this._trackListeners || []).filter((item) => {
      if (item.id !== id) return true;
      item.track.removeEventListener?.(item.event || 'ended', item.onEnded);
      return false;
    });
  }

  _bindVideo(id, mediaStream) {
    let video = this._videos.get(id);
    if (!video) {
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      this._sink?.appendChild?.(video);
      this._videos.set(id, video);
      this._watch(video);
    }
    if (video.srcObject !== mediaStream) {
      video.srcObject = mediaStream;
      const playing = video.play?.();
      if (playing && typeof playing.catch === 'function') playing.catch(() => {});
    }
  }

  _watch(video) {
    if (typeof video.requestVideoFrameCallback === 'function') {
      const tick = () => {
        if (this._state !== 'running' || ![...this._videos.values()].includes(video)) return;
        this._pendingSignals += 1;
        this._videoDirty = true;
        this._needsFrame = true;
        this._arm();
        try {
          video.requestVideoFrameCallback(tick);
        } catch (err) {
          this._renderError(err);
        }
      };
      video.requestVideoFrameCallback(tick);
      return;
    }
    this._needsFallback = true;
    if (this._fallbackHandle == null && typeof requestAnimationFrame === 'function') {
      const loop = () => {
        if (this._state !== 'running') return;
        let changed = false;
        for (const item of this._videos.values()) {
          if (typeof item.requestVideoFrameCallback === 'function') continue;
          if (item.readyState >= 2 && item.currentTime !== item._seenTime) {
            item._seenTime = item.currentTime;
            changed = true;
          }
        }
        if (changed) {
          this._pendingSignals += 1;
          this._videoDirty = true;
          this._needsFrame = true;
          this._arm();
        }
        this._fallbackHandle = requestAnimationFrame(loop);
      };
      this._fallbackHandle = requestAnimationFrame(loop);
    }
  }

  _watchTracks(id, mediaStream) {
    const tracks = mediaStream.getTracks?.() || [];
    for (const track of tracks) {
      if (!track.addEventListener) continue;
      const onEnded = () => {
        track.readyState = 'ended';
        this._bind(id);
        this._needsFrame = true;
        this._arm();
        this._publish();
      };
      track.addEventListener('ended', onEnded);
      this._trackListeners.push({ id, track, onEnded });
    }
    if (mediaStream.addEventListener) {
      const onAdd = () => this._bind(id);
      mediaStream.addEventListener('addtrack', onAdd);
      this._trackListeners.push({ id, track: mediaStream, onEnded: onAdd, event: 'addtrack' });
    }
  }

  _bindAudio(id, mediaStream) {
    const gain = this.composition.audio.find((item) => item.id === id)?.gain ?? 1;
    const tracks = (mediaStream.getAudioTracks?.() || []).filter((track) => track.readyState !== 'ended');
    const existing = this._audioNodes.get(id);
    if (
      existing &&
      existing.mediaStream === mediaStream &&
      existing.tracks.length === tracks.length &&
      existing.tracks.every((track, index) => track === tracks[index])
    ) {
      for (const node of existing.nodes) node.gain.gain.value = gain;
      return;
    }
    this._releaseAudio(id);
    const nodes = [];
    try {
      for (const track of tracks) {
        const Stream = globalThis.MediaStream;
        const carrier = typeof Stream === 'function' ? new Stream([track]) : mediaStream;
        const source = this._audioContext.createMediaStreamSource(carrier);
        const gainNode = this._audioContext.createGain();
        gainNode.gain.value = gain;
        source.connect(gainNode);
        gainNode.connect(this._destination);
        nodes.push({ source, gain: gainNode, track });
      }
    } catch (err) {
      for (const node of nodes) {
        node.source.disconnect?.();
        node.gain.disconnect?.();
      }
      this._audioErrors.set(id, err.message || 'Audio input failed');
      this._publish();
      return;
    }
    this._audioErrors.delete(id);
    this._audioNodes.set(id, { mediaStream, tracks, nodes });
  }

  _releaseVideo(id) {
    const video = this._videos.get(id);
    if (!video) return;
    video.srcObject = null;
    video.remove?.();
    this._videos.delete(id);
  }

  _releaseAudio(id) {
    const group = this._audioNodes.get(id);
    if (!group) return;
    for (const node of group.nodes) {
      node.source.disconnect?.();
      node.gain.disconnect?.();
    }
    this._audioNodes.delete(id);
  }

  _resolveImages() {
    const live = new Set();
    for (const layer of this.composition.layers) {
      if (layer.type !== 'image') continue;
      if (layer.image) {
        live.add(layer);
        this._staticDirty = true;
        this._needsFrame = true;
        continue;
      }
      if (!layer.src) continue;
      live.add(layer.src);
      if (this._decoded.has(layer.src)) continue;
      loadImage(layer.src)
        .then((image) => {
          if (this._state !== 'running') return;
          if (!this.composition.layers.some((item) => item.type === 'image' && item.src === layer.src)) return;
          this._decoded.set(layer.src, image);
          this._imageErrors.delete(layer.src);
          this._staticDirty = true;
          this._needsFrame = true;
          this._arm();
          this._publish();
        })
        .catch((err) => {
          if (this._state !== 'running') return;
          this._imageErrors.set(layer.src, err.message || 'Image failed');
          this._publish();
        });
    }
    for (const src of [...this._decoded.keys()]) {
      if (!live.has(src)) this._decoded.delete(src);
    }
  }

  _prefix() {
    const prefix = [];
    for (const layer of this.composition.layers) {
      if (layer.type === 'stream') break;
      prefix.push(layer);
    }
    return prefix;
  }

  _paintStatic() {
    const ctx = this._staticCtx;
    if (!ctx) return;
    const { width, height } = this.settings.video;
    ctx.clearRect?.(0, 0, width, height);
    if (ctx.fillRect) {
      ctx.fillStyle = this.composition.background || '#000000';
      ctx.fillRect(0, 0, width, height);
    }
    for (const layer of this._prefix()) {
      if (layer.type !== 'image') continue;
      const image = layer.image || this._decoded.get(layer.src);
      if (image) drawFitted(ctx, image, layerBox(layer, width, height), layer.fit || 'cover');
    }
    this._staticDirty = false;
  }

  _draw() {
    if (this._staticDirty) this._paintStatic();
    const ctx = this._ctx;
    const { width, height } = this.settings.video;
    ctx.drawImage(this._staticCanvas, 0, 0);
    let dynamic = false;
    for (const layer of this.composition.layers) {
      if (layer.type === 'stream') dynamic = true;
      if (!dynamic) continue;
      const box = layerBox(layer, width, height);
      if (layer.type === 'image') {
        const image = layer.image || this._decoded.get(layer.src);
        if (image) drawFitted(ctx, image, box, layer.fit || 'cover');
      } else if (layer.type === 'stream') {
        const video = this._videos.get(layer.id);
        if (video && video.readyState >= 2) drawFitted(ctx, video, box, layer.fit || 'cover');
      }
    }
  }

  _arm() {
    if (this._timer != null || this._state !== 'running') return;
    if (!this._needsFrame) return;
    const wait = Math.max(0, this._nextFrame - nowMs());
    this._timer = setTimeout(() => {
      this._timer = null;
      this._compose();
    }, wait);
  }

  _compose() {
    if (this._state !== 'running' || !this._needsFrame) return;
    const started = nowMs();
    const interval = 1000 / this.settings.video.frameRate;
    if (started < this._nextFrame) {
      this._arm();
      return;
    }
    try {
      this._draw();
      if (typeof this._videoTrack.requestFrame === 'function') this._videoTrack.requestFrame();
    } catch (err) {
      this._renderError(err);
      return;
    }
    const elapsed = nowMs() - started;
    this._samples.push(elapsed);
    if (this._samples.length > 30) this._samples.shift();
    this._frameTimes.push(started);
    this._diagnostics.frames += 1;
    this._diagnostics.skipped += Math.max(0, this._pendingSignals - 1);
    this._pendingSignals = 0;
    this._videoDirty = false;
    this._needsFrame = false;
    this._nextFrame = started + interval;
  }

  _renderError(err) {
    this._renderMessage = err?.message || 'Render failed';
    this._publish();
  }

  _missing() {
    const missing = [];
    for (const id of this._wanted()) {
      if (!this.streams.get(id)) missing.push(id);
    }
    return missing;
  }

  _errors() {
    const errors = [];
    if (this._sampleRateRejected) {
      errors.push({ code: 'sample-rate', detail: 'Audio sample rate is fixed for this output' });
    }
    for (const [input, detail] of this._imageErrors) {
      if (this.composition.layers.some((layer) => layer.src === input)) {
        errors.push({ code: 'image', input, detail });
      }
    }
    for (const [input, detail] of this._audioErrors) {
      errors.push({ code: 'audio', input, detail });
    }
    if (this._renderMessage) errors.push({ code: 'render', detail: this._renderMessage });
    for (const id of this._wanted()) {
      const entry = this.streams.get(id);
      if (!entry?.mediaStream) continue;
      const relevant = [];
      if (this.composition.layers.some((layer) => layer.type === 'stream' && layer.id === id)) {
        relevant.push(...(entry.mediaStream.getVideoTracks?.() || []));
      }
      if (this.composition.audio.some((item) => item.id === id)) {
        relevant.push(...(entry.mediaStream.getAudioTracks?.() || []));
      }
      if (relevant.some((track) => track.readyState === 'ended')) {
        errors.push({ code: 'track-ended', input: id, detail: 'An input track has ended' });
      }
    }
    return errors;
  }

  _publish() {
    const snapshot = this.status;
    const key = JSON.stringify({
      state: snapshot.state,
      missing: snapshot.missing,
      errors: snapshot.errors
    });
    if (key === this._published) return;
    this._published = key;
    this.streams.app?.connection?.emit('stream-composer-status', { id: this.id, ...snapshot });
  }

  _releaseOwned() {
    if (this._timer != null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._fallbackHandle != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._fallbackHandle);
      this._fallbackHandle = null;
    }
    const connection = this.streams.app?.connection;
    if (connection?.removeListener) {
      if (this._onAdded) connection.removeListener(ADDED, this._onAdded);
      if (this._onUpdated) connection.removeListener(UPDATED, this._onUpdated);
      if (this._onRemoved) connection.removeListener(REMOVED, this._onRemoved);
    }
    this._onAdded = null;
    this._onUpdated = null;
    this._onRemoved = null;
    for (const item of this._trackListeners || []) {
      item.track.removeEventListener?.(item.event || 'ended', item.onEnded);
    }
    this._trackListeners = [];
    for (const id of [...(this._videos?.keys?.() || [])]) this._releaseVideo(id);
    for (const id of [...(this._audioNodes?.keys?.() || [])]) this._releaseAudio(id);
    this._sink?.remove?.();
    if (this._sink && document.body?.removeChild) {
      try {
        document.body.removeChild(this._sink);
      } catch (err) {
        /* already detached */
      }
    }
    try {
      this._videoTrack?.stop?.();
    } catch (err) {
      /* already ended */
    }
    try {
      this._audioTrack?.stop?.();
    } catch (err) {
      /* already ended */
    }
    this._audioContext?.close?.();
    this._output = null;
    this._videoTrack = null;
    this._audioTrack = null;
    this._canvas = null;
    this._needsFrame = false;
  }
}

module.exports = StreamComposer;
