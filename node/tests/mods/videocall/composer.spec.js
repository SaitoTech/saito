const Composer = require('../../../mods/videocall/lib/composer');

const ADDED = 'videocall-stream-added';
const UPDATED = 'videocall-stream-updated';
const REMOVED = 'videocall-stream-removed';

function makeTrack(kind) {
  const listeners = {};
  const track = {
    kind,
    id: `t${Math.random().toString(36).slice(2)}`,
    readyState: 'live',
    stop: jest.fn(),
    addEventListener(name, fn) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(fn);
    },
    removeEventListener(name, fn) {
      listeners[name] = (listeners[name] || []).filter((item) => item !== fn);
    },
    emit(name) {
      [...(listeners[name] || [])].forEach((fn) => fn());
    }
  };
  return track;
}

class FakeMediaStream {
  constructor(tracks = []) {
    this.tracks = [...tracks];
    this.listeners = {};
  }

  addTrack(track) {
    this.tracks.push(track);
    [...(this.listeners.addtrack || [])].forEach((fn) => fn({ track }));
  }

  addEventListener(name, fn) {
    this.listeners[name] = this.listeners[name] || [];
    this.listeners[name].push(fn);
  }

  removeEventListener(name, fn) {
    this.listeners[name] = (this.listeners[name] || []).filter((item) => item !== fn);
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

function makeVideo(useFrameCallback = true) {
  const video = {
    muted: false,
    playsInline: false,
    autoplay: false,
    srcObject: null,
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    currentTime: 0,
    callbacks: [],
    play: jest.fn(() => Promise.resolve()),
    remove: jest.fn()
  };
  if (useFrameCallback) {
    video.requestVideoFrameCallback = (fn) => {
      video.callbacks.push(fn);
    };
  }
  return video;
}

function makeCanvas() {
  const calls = [];
  const ctx = {
    calls,
    fillStyle: '',
    drawImage: jest.fn((...args) => calls.push(args)),
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn()
  };
  const track = makeTrack('video');
  track.requestFrame = jest.fn();
  return {
    width: 0,
    height: 0,
    ctx,
    track,
    getContext: jest.fn(() => ctx),
    captureStream: jest.fn(() => new FakeMediaStream([track]))
  };
}

class FakeAudioContext {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate;
    this.sources = [];
    this.gains = [];
    this.destinationTrack = makeTrack('audio');
    this.close = jest.fn();
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    const gain = {
      gain: { value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn()
    };
    this.gains.push(gain);
    return gain;
  }

  createMediaStreamSource(stream) {
    const source = { stream, connect: jest.fn(), disconnect: jest.fn() };
    this.sources.push(source);
    return source;
  }

  createMediaStreamDestination() {
    return { stream: new FakeMediaStream([this.destinationTrack]) };
  }
}

FakeAudioContext.instances = [];

function installBrowser({ useFrameCallback = true, failImages = new Set() } = {}) {
  const videos = [];
  const canvases = [];
  const createdImages = [];
  global.MediaStream = FakeMediaStream;
  global.AudioContext = FakeAudioContext;
  FakeAudioContext.instances = [];
  global.Image = class FakeImage {
    constructor() {
      createdImages.push(this);
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        if (failImages.has(value)) {
          this.onerror?.();
          return;
        }
        this.naturalWidth = 20;
        this.naturalHeight = 10;
        this.onload?.();
      });
    }
  };
  global.document = {
    body: {
      children: [],
      appendChild(node) {
        this.children.push(node);
      },
      removeChild(node) {
        this.children = this.children.filter((item) => item !== node);
      }
    },
    createElement(tag) {
      if (tag === 'canvas') {
        const canvas = makeCanvas();
        canvases.push(canvas);
        return canvas;
      }
      if (tag === 'video') {
        const video = makeVideo(useFrameCallback);
        videos.push(video);
        return video;
      }
      return {
        style: {},
        children: [],
        appendChild(node) {
          this.children.push(node);
        },
        remove() {}
      };
    }
  };
  return { videos, canvases, createdImages };
}

function registry() {
  const entries = new Map();
  const handlers = {};
  const connection = {
    on(name, fn) {
      handlers[name] = handlers[name] || [];
      handlers[name].push(fn);
    },
    removeListener(name, fn) {
      handlers[name] = (handlers[name] || []).filter((item) => item !== fn);
    },
    emit(name, payload) {
      [...(handlers[name] || [])].forEach((fn) => fn(payload));
    }
  };
  return {
    entries,
    handlers,
    app: { connection },
    get: (id) => entries.get(id) || null,
    emit: (name, entry) => connection.emit(name, entry)
  };
}

function entry(id, mediaStream) {
  return { id, mediaStream, source: 'peer', kind: 'camera', disposition: 'borrowed' };
}

function box(extra) {
  return { x: 0, y: 0, width: 320, height: 180, ...extra };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function signal(video) {
  const callback = video.callbacks[video.callbacks.length - 1];
  if (!callback) throw new Error('video has no frame callback');
  callback();
}

describe('Composer', () => {
  afterEach(() => {
    delete global.document;
    delete global.Image;
    delete global.AudioContext;
    delete global.MediaStream;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  });

  test('rejects an invalid config and keeps the previous one when an update is invalid', () => {
    const streams = registry();
    expect(() => new Composer()).toThrow(/stream registry/);
    expect(
      () =>
        new Composer(streams, {
          composition: { layers: [{ type: 'stream' }] }
        })
    ).toThrow(/id/);
    expect(
      () =>
        new Composer(streams, {
          settings: { video: { frameRate: 0 } }
        })
    ).toThrow(/positive/);

    const composer = new Composer(streams, {
      composition: { layers: [box({ type: 'stream', id: 'cam' })] },
      settings: { video: { width: 640, height: 360, frameRate: 15 } }
    });
    expect(composer.output).toBeNull();
    expect(composer.status.state).toBe('idle');
    expect(() => composer.update({ composition: { layers: [{ type: 'bogus' }] } })).toThrow(/Unknown layer/);
    expect(composer.composition.layers[0].id).toBe('cam');
    expect(composer.settings.video).toEqual({ width: 640, height: 360, frameRate: 15 });
  });

  test('merges partial updates without resetting the other half of the config', () => {
    const streams = registry();
    const composer = new Composer(streams, {
      composition: {
        background: '#111111',
        layers: [box({ type: 'stream', id: 'cam' })],
        audio: [{ id: 'cam', gain: 0.4 }]
      },
      settings: { video: { width: 640, height: 360, frameRate: 12 }, audio: { sampleRate: 16000 } }
    });

    composer.update({ settings: { video: { frameRate: 24 } } });
    expect(composer.settings.video).toEqual({ width: 640, height: 360, frameRate: 24 });
    expect(composer.settings.audio.sampleRate).toBe(16000);
    expect(composer.composition.layers).toHaveLength(1);
    expect(composer.composition.audio).toEqual([{ id: 'cam', gain: 0.4 }]);

    composer.update({ composition: { layers: [box({ type: 'stream', id: 'other' })] } });
    expect(composer.composition.layers[0].id).toBe('other');
    expect(composer.composition.audio).toEqual([{ id: 'cam', gain: 0.4 }]);
    expect(composer.composition.background).toBe('#111111');
    expect(composer.settings.video.frameRate).toBe(24);
  });

  test('starts one stable output and stops only the tracks it owns', async () => {
    const browser = installBrowser();
    const streams = registry();
    const videoTrack = makeTrack('video');
    const audioTrack = makeTrack('audio');
    const media = new FakeMediaStream([videoTrack, audioTrack]);
    streams.entries.set('cam', entry('cam', media));
    const statuses = [];
    streams.app.connection.on('stream-composer-status', (status) => statuses.push(status.state));

    const composer = new Composer(streams, {
      composition: {
        layers: [box({ type: 'stream', id: 'cam' })],
        audio: [{ id: 'cam', gain: 0.5 }]
      },
      settings: { video: { frameRate: 1000 } }
    });
    const output = composer.start();
    expect(composer.start()).toBe(output);
    await flush();

    const canvas = browser.canvases[0];
    expect(canvas.captureStream).toHaveBeenCalledWith(0);
    expect(output.getVideoTracks()[0]).toBe(canvas.track);
    expect(output.getAudioTracks()[0]).toBe(FakeAudioContext.instances[0].destinationTrack);
    expect(browser.videos[0].srcObject).toBe(media);
    expect(browser.videos[0].muted).toBe(true);
    expect(browser.videos[0].captureStream).toBeUndefined();
    expect(statuses).toContain('running');
    const videoBefore = output.getVideoTracks()[0];
    const audioBefore = output.getAudioTracks()[0];

    composer.update({ settings: { video: { width: 800, height: 450, frameRate: 10 } } });
    composer.update({ composition: { layers: [box({ type: 'stream', id: 'cam', x: 20 })] } });
    await flush();
    expect(composer.output).toBe(output);
    expect(output.getVideoTracks()[0]).toBe(videoBefore);
    expect(output.getAudioTracks()[0]).toBe(audioBefore);
    expect(canvas.width).toBe(800);
    expect(canvas.captureStream).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances).toHaveLength(1);

    composer.stop();
    expect(composer.output).toBeNull();
    expect(canvas.track.stop).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances[0].destinationTrack.stop).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledTimes(1);
    expect(videoTrack.stop).not.toHaveBeenCalled();
    expect(audioTrack.stop).not.toHaveBeenCalled();
    expect(composer.status.state).toBe('stopped');

    const restarted = composer.start();
    expect(restarted).not.toBe(output);
    expect(restarted.getVideoTracks()[0]).not.toBe(videoBefore);
    composer.stop();
  });

  test('attaches an input that appears after start and detaches it without stopping it', async () => {
    const browser = installBrowser();
    const streams = registry();
    const composer = new Composer(streams, {
      composition: {
        layers: [box({ type: 'stream', id: 'cam' })],
        audio: [{ id: 'cam' }]
      },
      settings: { video: { frameRate: 1000 } }
    });
    const output = composer.start();
    await flush();
    expect(composer.status.missing).toEqual(['cam']);
    expect(composer.status.state).toBe('running');
    const videoTrack = output.getVideoTracks()[0];

    const mediaTrack = makeTrack('video');
    const audioTrack = makeTrack('audio');
    const media = new FakeMediaStream([mediaTrack, audioTrack]);
    const record = entry('cam', media);
    streams.entries.set('cam', record);
    streams.emit(ADDED, record);
    await flush();

    expect(browser.videos[0].srcObject).toBe(media);
    expect(composer.status.diagnostics.visualInputs).toBe(1);
    expect(composer.status.missing).toEqual([]);
    expect(output.getVideoTracks()[0]).toBe(videoTrack);

    streams.entries.delete('cam');
    streams.emit(REMOVED, record);
    await flush();
    expect(composer.status.missing).toEqual(['cam']);
    expect(mediaTrack.stop).not.toHaveBeenCalled();
    expect(audioTrack.stop).not.toHaveBeenCalled();
    expect(composer.output.getVideoTracks()[0]).toBe(videoTrack);
    expect(composer.status.state).toBe('running');

    streams.emit(ADDED, entry('someone-else', new FakeMediaStream([makeTrack('video')])));
    expect(composer.status.diagnostics.visualInputs).toBe(0);
    composer.stop();
  });

  test('rebinds a replaced MediaStream and follows tracks added to the same one', async () => {
    const browser = installBrowser();
    const streams = registry();
    const firstAudio = makeTrack('audio');
    const first = new FakeMediaStream([makeTrack('video'), firstAudio]);
    const record = entry('cam', first);
    streams.entries.set('cam', record);
    const composer = new Composer(streams, {
      composition: {
        layers: [box({ type: 'stream', id: 'cam' })],
        audio: [{ id: 'cam', gain: 1 }]
      },
      settings: { video: { frameRate: 1000 } }
    });
    const output = composer.start();
    await flush();
    const audioTrack = output.getAudioTracks()[0];
    expect(FakeAudioContext.instances[0].sources).toHaveLength(1);
    expect(FakeAudioContext.instances[0].sources[0].stream.getAudioTracks()).toEqual([firstAudio]);

    const secondAudio = makeTrack('audio');
    const second = new FakeMediaStream([makeTrack('video'), secondAudio]);
    record.mediaStream = second;
    streams.emit(UPDATED, record);
    await flush();
    expect(browser.videos[0].srcObject).toBe(second);
    expect(firstAudio.stop).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].sources[0].disconnect).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].sources[1].stream.getAudioTracks()).toEqual([secondAudio]);
    expect(output.getAudioTracks()[0]).toBe(audioTrack);

    const extra = makeTrack('audio');
    second.addTrack(extra);
    await flush();
    const carried = FakeAudioContext.instances[0].sources.map((source) => source.stream.getAudioTracks()[0]);
    expect(carried).toEqual(expect.arrayContaining([secondAudio, extra]));
    expect(output.getAudioTracks()[0]).toBe(audioTrack);
    expect(secondAudio.stop).not.toHaveBeenCalled();
    composer.stop();
    expect(secondAudio.stop).not.toHaveBeenCalled();
    expect(extra.stop).not.toHaveBeenCalled();
  });

  test('reports an ended input track and keeps the output running', async () => {
    installBrowser();
    const streams = registry();
    const videoTrack = makeTrack('video');
    const audioTrack = makeTrack('audio');
    const media = new FakeMediaStream([videoTrack, audioTrack]);
    streams.entries.set('cam', entry('cam', media));
    const composer = new Composer(streams, {
      composition: {
        layers: [box({ type: 'stream', id: 'cam' })],
        audio: [{ id: 'cam' }]
      },
      settings: { video: { frameRate: 1000 } }
    });
    const output = composer.start();
    await flush();
    const sources = FakeAudioContext.instances[0].sources.length;

    videoTrack.emit('ended');
    await flush();
    expect(composer.status.errors.map((error) => error.code)).toContain('track-ended');
    expect(composer.status.state).toBe('running');
    expect(output.getVideoTracks()[0].stop).not.toHaveBeenCalled();
    expect(videoTrack.stop).not.toHaveBeenCalled();

    audioTrack.emit('ended');
    await flush();
    expect(FakeAudioContext.instances[0].sources).toHaveLength(sources);
    expect(FakeAudioContext.instances[0].sources[0].disconnect).toHaveBeenCalled();
    expect(output.getAudioTracks()[0].readyState).toBe('live');
    composer.stop();
  });

  test('changes gain without rebuilding the audio graph and preserves the output audio track', async () => {
    installBrowser();
    const streams = registry();
    const audioTrack = makeTrack('audio');
    streams.entries.set('mic', entry('mic', new FakeMediaStream([audioTrack])));
    streams.entries.set('cam', entry('cam', new FakeMediaStream([makeTrack('video')])));
    const composer = new Composer(streams, {
      composition: {
        layers: [box({ type: 'stream', id: 'cam' })],
        audio: [{ id: 'mic', gain: 0.25 }]
      },
      settings: { video: { frameRate: 1000 } }
    });
    const output = composer.start();
    await flush();
    const context = FakeAudioContext.instances[0];
    expect(context.sources).toHaveLength(1);
    expect(context.gains[0].gain.value).toBe(0.25);
    expect(composer.status.diagnostics.audioInputs).toBe(1);
    expect(composer.status.diagnostics.visualInputs).toBe(1);

    composer.update({ composition: { audio: [{ id: 'mic', gain: 0.8 }] } });
    await flush();
    expect(context.sources).toHaveLength(1);
    expect(context.gains).toHaveLength(1);
    expect(context.gains[0].gain.value).toBe(0.8);
    expect(output.getAudioTracks()[0]).toBe(context.destinationTrack);

    composer.update({ composition: { audio: [] } });
    await flush();
    expect(context.gains[0].disconnect).toHaveBeenCalled();
    expect(audioTrack.stop).not.toHaveBeenCalled();
    expect(output.getAudioTracks()[0]).toBe(context.destinationTrack);
    expect(composer.composition.layers[0].id).toBe('cam');
    composer.stop();
  });

  test('rejects a sample-rate change while running and keeps the audio track', async () => {
    installBrowser();
    const streams = registry();
    const composer = new Composer(streams, {
      settings: { audio: { sampleRate: 48000 }, video: { frameRate: 1000 } }
    });
    composer.update({ settings: { audio: { sampleRate: 16000 } } });
    const output = composer.start();
    await flush();
    expect(FakeAudioContext.instances[0].sampleRate).toBe(16000);
    composer.update({ settings: { audio: { sampleRate: 8000 } } });
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].sampleRate).toBe(16000);
    expect(composer.settings.audio.sampleRate).toBe(16000);
    expect(composer.status.errors.map((error) => error.code)).toContain('sample-rate');
    expect(composer.output.getAudioTracks()[0]).toBe(output.getAudioTracks()[0]);
    composer.stop();
  });

  test('reports a failed image and a missing input without ending the composition', async () => {
    const browser = installBrowser({ failImages: new Set(['https://cdn.example/missing.png']) });
    const streams = registry();
    const composer = new Composer(streams, {
      composition: {
        layers: [
          box({ type: 'image', src: 'https://cdn.example/missing.png' }),
          box({ type: 'stream', id: 'absent' })
        ]
      },
      settings: { video: { frameRate: 1000 } }
    });
    const output = composer.start();
    await flush();
    expect(output).toBe(composer.output);
    expect(composer.status.state).toBe('running');
    expect(composer.status.missing).toEqual(['absent']);
    expect(composer.status.errors).toEqual([
      expect.objectContaining({ code: 'image', input: 'https://cdn.example/missing.png' })
    ]);
    expect(browser.createdImages).toHaveLength(1);
    composer.stop();
  });

  test('decodes a static image once and blits a cached background under changing video frames', async () => {
    const counts = [];
    for (const inputs of [1, 2, 4, 8]) {
      const browser = installBrowser();
      const streams = registry();
      const layers = [box({ type: 'image', src: 'https://cdn.example/table.png' })];
      for (let index = 0; index < inputs; index += 1) {
        const id = `cam-${inputs}-${index}`;
        streams.entries.set(id, entry(id, new FakeMediaStream([makeTrack('video')])));
        layers.push(box({ type: 'stream', id }));
      }
      const composer = new Composer(streams, {
        composition: { background: '#224422', layers },
        settings: { video: { width: 1280, height: 720, frameRate: 1000 } }
      });
      composer.start();
      await flush();
      for (const video of browser.videos) {
        video.readyState = 2;
        video.videoWidth = 16;
        video.videoHeight = 9;
      }
      const staticDraws = () => browser.canvases[1].ctx.drawImage.mock.calls.length;
      const mainDraws = () => browser.canvases[0].ctx.drawImage.mock.calls.length;
      const staticBefore = staticDraws();
      const mainBefore = mainDraws();
      expect(staticBefore).toBe(1);
      expect(browser.createdImages).toHaveLength(inputs === 1 ? 1 : 0);

      for (const video of browser.videos) signal(video);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(staticDraws()).toBe(staticBefore);
      expect(mainDraws() - mainBefore).toBe(1 + inputs);
      expect(composer.status.diagnostics.frames).toBe(2);
      expect(composer.status.diagnostics.skipped).toBe(inputs - 1);
      expect(composer.status.diagnostics.visualInputs).toBe(inputs);
      counts.push({
        inputs,
        composeMs: composer.status.diagnostics.maxComposeMs,
        frames: composer.status.diagnostics.frames
      });
      composer.stop();
    }
    expect(counts.map((item) => item.inputs)).toEqual([1, 2, 4, 8]);
    expect(counts.every((item) => item.frames === 2)).toBe(true);
  });

  test('does not redraw when no input frame or config change is pending', async () => {
    const browser = installBrowser();
    const streams = registry();
    streams.entries.set('cam', entry('cam', new FakeMediaStream([makeTrack('video')])));
    const composer = new Composer(streams, {
      composition: { layers: [box({ type: 'stream', id: 'cam' })] },
      settings: { video: { frameRate: 1000 } }
    });
    composer.start();
    await flush();
    const draws = browser.canvases[0].ctx.drawImage.mock.calls.length;
    const frames = composer.status.diagnostics.frames;
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(browser.canvases[0].ctx.drawImage.mock.calls.length).toBe(draws);
    expect(composer.status.diagnostics.frames).toBe(frames);
    composer.stop();
  });

  test('falls back to animation frames when video frame callbacks are missing', async () => {
    const browser = installBrowser({ useFrameCallback: false });
    const frames = [];
    global.requestAnimationFrame = (fn) => {
      frames.push(fn);
      return frames.length;
    };
    global.cancelAnimationFrame = jest.fn();
    const streams = registry();
    streams.entries.set('cam', entry('cam', new FakeMediaStream([makeTrack('video')])));
    const composer = new Composer(streams, {
      composition: { layers: [box({ type: 'stream', id: 'cam' })] },
      settings: { video: { frameRate: 1000 } }
    });
    composer.start();
    await flush();
    browser.videos[0].readyState = 2;
    browser.videos[0].videoWidth = 8;
    browser.videos[0].videoHeight = 8;
    browser.videos[0].currentTime = 0.2;
    frames[frames.length - 1]();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(composer.status.diagnostics.frames).toBeGreaterThan(1);
    expect(browser.canvases[0].track.requestFrame).toHaveBeenCalled();
    composer.stop();
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  test('ignores registry traffic for streams the composition does not use', async () => {
    const browser = installBrowser();
    const streams = registry();
    const composer = new Composer(streams, {
      composition: { layers: [box({ type: 'stream', id: 'kept' })] },
      settings: { video: { frameRate: 1000 } }
    });
    composer.start();
    const other = entry('other', new FakeMediaStream([makeTrack('video')]));
    streams.entries.set('other', other);
    streams.emit(ADDED, other);
    streams.emit(UPDATED, other);
    streams.emit(REMOVED, other);
    await flush();
    expect(browser.videos).toHaveLength(0);
    expect(composer.status.diagnostics.visualInputs).toBe(0);
    composer.stop();
    streams.entries.set('kept', entry('kept', new FakeMediaStream([makeTrack('video')])));
    streams.emit(ADDED, streams.entries.get('kept'));
    expect(browser.videos).toHaveLength(0);
  });

  test('adds and removes streams and registers one output MediaStream', () => {
    installBrowser();
    const streams = registry();
    const registered = [];
    streams.registerComposite = (mediaStream) => {
      const record = { id: 'composite', mediaStream, getMediaStream: () => mediaStream };
      registered.push(record);
      return record;
    };
    const composer = new Composer(streams);
    const camera = { id: 'cam', mediaStream: new FakeMediaStream([makeTrack('video'), makeTrack('audio')]) };
    composer.addStream(camera, { x: 0, y: 0, width: 100, height: 80, fit: 'contain' });
    expect(composer.composition.layers.map((layer) => layer.id)).toEqual(['cam']);
    expect(composer.composition.audio.map((item) => item.id)).toEqual(['cam']);
    composer.addStream({ id: 'cam2' }, { x: 100, y: 0, width: 100, height: 80 });
    expect(composer.composition.layers.map((layer) => layer.id)).toEqual(['cam', 'cam2']);
    composer.removeStream(camera);
    expect(composer.composition.layers.map((layer) => layer.id)).toEqual(['cam2']);
    expect(composer.composition.audio.map((item) => item.id)).toEqual(['cam2']);
    composer.start();
    const output = composer.getOutputStream();
    expect(output).toBe(registered[0]);
    expect(output.getMediaStream()).toBe(composer.output);
    expect(composer.getOutputStream()).toBe(output);
    const first = composer.output;
    composer.stop();
    composer.start();
    expect(composer.output).not.toBe(first);
    expect(composer.getOutputStream().getMediaStream()).toBe(composer.output);
    composer.stop();
  });
});
