const { EventEmitter } = require('events');
const Videocall = require('../../../mods/videocall/videocall');
const StreamManager = require('../../../mods/videocall/lib/stream_manager');
const Stun = require('../../../mods/stun/stun');

function call() {
  const created = Object.create(Videocall.prototype);
  created.app = {
    options: {},
    storage: { saveOptions: jest.fn() }
  };
  created.room_obj = { call_peers: [] };
  created.screen_share = false;
  created.stun = { setCameraSenderBitrate: jest.fn(), setScreenSenderBitrate: jest.fn() };
  created.streams = { setCameraCapture: jest.fn(() => Promise.resolve()) };
  return created;
}

function sender(trackRole, track) {
  const parameters = { transactionId: '1', encodings: [{ maxBitrate: 1, active: true }] };
  return {
    trackRole,
    track,
    getParameters: () => parameters,
    setParameters: jest.fn(async (next) => {
      parameters.encodings = next.encodings;
    }),
    parameters
  };
}

describe('camera profile', () => {
  test('selects the default capture profile for each remote peer count', () => {
    const videocall = call();
    expect(videocall.cameraProfile(0)).toEqual({
      width: 1280,
      height: 720,
      frameRate: 24,
      cameraBitrateBudget: 1500000
    });
    expect(videocall.cameraProfile(1)).toEqual(videocall.cameraProfile(0));
    expect(videocall.cameraProfile(2)).toEqual({
      width: 640,
      height: 360,
      frameRate: 15,
      cameraBitrateBudget: 1600000
    });
    expect(videocall.cameraProfile(4)).toEqual(videocall.cameraProfile(2));
    expect(videocall.cameraProfile(5)).toEqual({
      width: 320,
      height: 180,
      frameRate: 10,
      cameraBitrateBudget: 1200000
    });
    expect(videocall.cameraProfile(6)).toEqual(videocall.cameraProfile(5));
  });

  test('splits the camera budget across the current call peers', async () => {
    const videocall = call();
    videocall.room_obj.call_peers = ['a', 'b', 'c', 'd'];
    await videocall.applyCameraProfile();
    expect(videocall.streams.setCameraCapture).toHaveBeenCalledWith({
      width: 640,
      height: 360,
      frameRate: 15
    });
    expect(videocall.stun.setCameraSenderBitrate).toHaveBeenCalledTimes(4);
    for (const peer of videocall.room_obj.call_peers) {
      expect(videocall.stun.setCameraSenderBitrate).toHaveBeenCalledWith(peer, 400000);
    }
  });

  test('does not configure senders when nobody else is in the call', async () => {
    const videocall = call();
    await videocall.applyCameraProfile();
    expect(videocall.streams.setCameraCapture).toHaveBeenCalledWith({
      width: 1280,
      height: 720,
      frameRate: 24
    });
    expect(videocall.stun.setCameraSenderBitrate).not.toHaveBeenCalled();
  });

  test('reallocates when a peer joins or leaves', async () => {
    const videocall = call();
    videocall.room_obj.call_peers = ['a'];
    await videocall.applyCameraProfile();
    expect(videocall.stun.setCameraSenderBitrate).toHaveBeenCalledWith('a', 1500000);

    videocall.room_obj.call_peers.push('b');
    await videocall.applyCameraProfile();
    expect(videocall.stun.setCameraSenderBitrate).toHaveBeenCalledWith('a', 800000);
    expect(videocall.stun.setCameraSenderBitrate).toHaveBeenCalledWith('b', 800000);

    videocall.room_obj.call_peers.splice(1, 1);
    await videocall.applyCameraProfile();
    expect(videocall.stun.setCameraSenderBitrate).toHaveBeenLastCalledWith('a', 1500000);
  });

  test('gives a newly listed peer the current share', async () => {
    const videocall = call();
    videocall.room_obj.call_peers = ['a', 'b', 'c', 'd', 'e'];
    await videocall.applyCameraProfile();
    expect(videocall.stun.setCameraSenderBitrate).toHaveBeenCalledWith('e', 240000);
    expect(videocall.streams.setCameraCapture).toHaveBeenCalledWith({
      width: 320,
      height: 180,
      frameRate: 10
    });
  });

  test('uses the default profile when the stored mode is not supported', async () => {
    const videocall = call();
    videocall.app.options.videocall = {
      settings: { mode: 'unlimited', layout: 'keep-me' }
    };
    videocall.room_obj.call_peers = ['a'];
    await videocall.applyCameraProfile();
    expect(videocall.streams.setCameraCapture).toHaveBeenCalledWith({
      width: 1280,
      height: 720,
      frameRate: 24
    });
    expect(videocall.stun.setCameraSenderBitrate).toHaveBeenCalledWith('a', 1500000);
    expect(videocall.app.options.videocall.settings).toEqual({
      mode: 'unlimited',
      layout: 'keep-me'
    });
  });

  test('splits the screen budget across remote peers and not the camera senders', async () => {
    const videocall = call();
    videocall.screen_share = true;
    videocall.room_obj.call_peers = ['a', 'b', 'c'];
    videocall.applyScreenShareBitrate();
    expect(videocall.stun.setScreenSenderBitrate).toHaveBeenCalledTimes(3);
    expect(videocall.stun.setScreenSenderBitrate).toHaveBeenCalledWith('a', 500000);
    expect(videocall.stun.setCameraSenderBitrate).not.toHaveBeenCalled();
  });

  test('initializes and keeps the media mode on the videocall options', () => {
    const videocall = call();
    videocall.initializeMediaSettings();
    expect(videocall.app.options.videocall.settings.mode).toBe('default');
    expect(videocall.app.storage.saveOptions).toHaveBeenCalledTimes(1);

    videocall.app.options.videocall.settings.mode = 'default';
    videocall.initializeMediaSettings();
    expect(videocall.app.storage.saveOptions).toHaveBeenCalledTimes(1);
  });
});

describe('camera capture and sender bitrate', () => {
  test('applies the profile to the first camera track and again after it is replaced', async () => {
    const applied = [];
    const first = {
      kind: 'video',
      readyState: 'live',
      applyConstraints: jest.fn(async (constraints) => {
        applied.push(constraints);
      })
    };
    const second = {
      kind: 'video',
      readyState: 'live',
      applyConstraints: jest.fn(async (constraints) => {
        applied.push(constraints);
      })
    };
    const stream = {
      getVideoTracks: () => [stream.video],
      video: first
    };
    const manager = Object.create(StreamManager.prototype);
    manager.localStream = stream;
    manager.mod = { diagnostics: { record: jest.fn() } };

    await manager.setCameraCapture({ width: 1280, height: 720, frameRate: 24 });
    await manager.setCameraCapture({ width: 1280, height: 720, frameRate: 24 });
    expect(first.applyConstraints).toHaveBeenCalledTimes(1);

    stream.video = second;
    await manager.setCameraCapture({ width: 640, height: 360, frameRate: 15 });
    expect(second.applyConstraints).toHaveBeenCalledWith({
      width: { ideal: 640 },
      height: { ideal: 360 },
      frameRate: { ideal: 15 }
    });
    expect(applied).toHaveLength(2);
  });

  test('keeps the call up when the camera rejects the constraints', async () => {
    const track = {
      kind: 'video',
      readyState: 'live',
      applyConstraints: jest.fn(async () => {
        const error = new Error('nope');
        error.name = 'OverconstrainedError';
        throw error;
      })
    };
    const manager = Object.create(StreamManager.prototype);
    manager.localStream = { getVideoTracks: () => [track] };
    manager.mod = { diagnostics: { record: jest.fn() } };

    await expect(
      manager.setCameraCapture({ width: 1280, height: 720, frameRate: 24 })
    ).resolves.toBeUndefined();
    expect(manager.mod.diagnostics.record).toHaveBeenCalled();
    expect(track.cameraCaptureKey).toBeUndefined();
  });

  test('sets bitrate on the camera sender and the screen sender separately', async () => {
    const cameraTrack = { kind: 'video' };
    const screenTrack = { kind: 'video' };
    const camera = sender('camera', cameraTrack);
    const screen = sender('screen', screenTrack);
    const stun = Object.create(Stun.prototype);
    stun.peers = new Map([
      [
        'peer-a',
        {
          signalingState: 'stable',
          getSenders: () => [camera, screen]
        }
      ]
    ]);
    stun.diagnostic = jest.fn();

    await stun.setCameraSenderBitrate('peer-a', 400000);
    await stun.setScreenSenderBitrate('peer-a', 500000);

    expect(camera.parameters.encodings[0]).toEqual({ maxBitrate: 400000, active: true });
    expect(screen.parameters.encodings[0]).toEqual({ maxBitrate: 500000, active: true });
    expect(camera.parameters.transactionId).toBe('1');
  });

  test('ignores a rejected sender update', async () => {
    const camera = sender('camera', { kind: 'video' });
    camera.setParameters = jest.fn(async () => {
      throw new Error('unsupported');
    });
    const stun = Object.create(Stun.prototype);
    stun.peers = new Map([
      ['peer-a', { signalingState: 'stable', getSenders: () => [camera] }]
    ]);
    stun.diagnostic = jest.fn();

    await expect(stun.setCameraSenderBitrate('peer-a', 400000)).resolves.toBeUndefined();
    expect(stun.diagnostic).toHaveBeenCalled();
  });
});

describe('outgoing sender roles', () => {
  function manager() {
    const connection = new EventEmitter();
    const app = {
      connection,
      browser: { lockNavigation() {} },
      options: { stun: { settings: {} } }
    };
    const mod = {
      publicKey: 'local',
      room_obj: { call_peers: ['peer-a'] },
      applyCameraProfile: jest.fn(),
      applyScreenShareBitrate: jest.fn(),
      diagnostics: { record() {} },
      screen_share: false,
      stun: { peers: new Map() }
    };
    const created = new StreamManager(app, mod, { video: true, audio: true });
    return { created, mod, connection };
  }

  test('marks a camera track and a screen track on the peer connection', async () => {
    const { created, mod, connection } = manager();
    const cameraTrack = { kind: 'video', enabled: true, readyState: 'live' };
    const screenTrack = { kind: 'video', enabled: true, readyState: 'live' };
    const senders = [];
    const peerConnection = {
      signalingState: 'stable',
      getSenders: () => senders,
      addTrack(track) {
        const createdSender = { track };
        senders.push(createdSender);
        return createdSender;
      }
    };
    created.localStream = {
      getTracks: () => [cameraTrack],
      getVideoTracks: () => [cameraTrack],
      getAudioTracks: () => []
    };
    mod.stun.peers.set('peer-a', peerConnection);
    connection.emit('stun-new-peer-connection', 'peer-a', peerConnection);
    expect(senders[0].trackRole).toBe('camera');
    expect(mod.applyCameraProfile).toHaveBeenCalled();

    mod.sendOffChainMessage = jest.fn(() => Promise.resolve());
    mod.CallInterface = { receiveRemoteStream() {}, setPresenting() {} };
    global.navigator = {
      mediaDevices: {
        getDisplayMedia: async () => ({
          getTracks: () => [screenTrack],
          getVideoTracks: () => [screenTrack]
        })
      }
    };

    await created.beginShareScreen();
    expect(senders[1].trackRole).toBe('screen');
    expect(mod.applyScreenShareBitrate).toHaveBeenCalled();
  });
});

function deferredSender(trackRole, track) {
  const parameters = { transactionId: '1', encodings: [{ active: true }] };
  const pending = [];
  const sender = {
    trackRole,
    track,
    parameters,
    getParameters: () => parameters,
    setParameters: jest.fn(
      (next) =>
        new Promise((resolve) => {
          pending.push({ next, resolve });
        })
    ),
    replaceTrack: jest.fn(async (next) => {
      sender.track = next;
    })
  };
  sender.release = () => {
    const job = pending.shift();
    if (!job) return false;
    parameters.encodings = job.next.encodings;
    parameters.transactionId = job.next.transactionId;
    job.resolve();
    return true;
  };
  return sender;
}

function stunWith(peerId, senders) {
  const stun = Object.create(Stun.prototype);
  stun.diagnostic = jest.fn();
  stun.peers = new Map([
    [peerId, { signalingState: 'stable', getSenders: () => senders }]
  ]);
  return stun;
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('sender bitrate serialization', () => {
  test('applies a newer camera bitrate after the in-flight write and skips the superseded one', async () => {
    const camera = deferredSender('camera', { kind: 'video' });
    const stun = stunWith('peer-a', [camera]);

    const first = stun.setCameraSenderBitrate('peer-a', 1500000);
    await flush();
    const second = stun.setCameraSenderBitrate('peer-a', 800000);
    const third = stun.setCameraSenderBitrate('peer-a', 400000);
    expect(camera.setParameters).toHaveBeenCalledTimes(1);

    camera.release();
    await flush();
    camera.release();
    await flush();
    expect(camera.parameters.encodings[0].maxBitrate).toBe(400000);
    expect(camera.parameters.transactionId).toBe('1');
    expect(camera.setParameters).toHaveBeenCalledTimes(2);
    await Promise.all([first, second, third]);
  });

  test('serializes screen bitrate updates on the screen sender only', async () => {
    const camera = deferredSender('camera', { kind: 'video' });
    const screen = deferredSender('screen', { kind: 'video' });
    const stun = stunWith('peer-a', [camera, screen]);

    const first = stun.setScreenSenderBitrate('peer-a', 1500000);
    await flush();
    stun.setScreenSenderBitrate('peer-a', 750000);
    stun.setScreenSenderBitrate('peer-a', 500000);
    expect(screen.setParameters).toHaveBeenCalledTimes(1);
    expect(camera.setParameters).not.toHaveBeenCalled();

    screen.release();
    await flush();
    screen.release();
    await flush();
    expect(screen.parameters.encodings[0].maxBitrate).toBe(500000);
    expect(camera.parameters.encodings[0].maxBitrate).toBeUndefined();
    await first;
  });

  test('a group join settles on the latest share after earlier writes', async () => {
    const videocall = call();
    const cameras = {
      a: deferredSender('camera', { kind: 'video' }),
      b: deferredSender('camera', { kind: 'video' }),
      c: deferredSender('camera', { kind: 'video' })
    };
    const stun = Object.create(Stun.prototype);
    stun.diagnostic = jest.fn();
    stun.peers = new Map();
    const connect = (peerId) => {
      stun.peers.set(peerId, {
        signalingState: 'stable',
        getSenders: () => [cameras[peerId]]
      });
    };
    videocall.stun = stun;
    videocall.streams.setCameraCapture = jest.fn(() => Promise.resolve());

    videocall.room_obj.call_peers = ['a'];
    connect('a');
    const first = videocall.applyCameraProfile();
    await flush();

    videocall.room_obj.call_peers = ['a', 'b'];
    connect('b');
    videocall.applyCameraProfile();
    await flush();

    videocall.room_obj.call_peers = ['a', 'b', 'c'];
    connect('c');
    videocall.applyCameraProfile();
    await flush();

    for (let attempt = 0; attempt < 6; attempt++) {
      Object.values(cameras).forEach((sender) => sender.release());
      await flush();
    }

    const share = Math.floor(1600000 / 3);
    for (const sender of Object.values(cameras)) {
      expect(sender.parameters.encodings[0].maxBitrate).toBe(share);
    }
    await first;
  });
});

describe('camera track replacement', () => {
  function ratedSender(trackRole, track) {
    const parameters = { transactionId: '1', encodings: [{ active: true }] };
    const sender = {
      trackRole,
      track,
      parameters,
      getParameters: () => parameters,
      setParameters: jest.fn(async (next) => {
        parameters.encodings = next.encodings;
        parameters.transactionId = next.transactionId;
      }),
      replaceTrack: jest.fn(async (next) => {
        sender.track = next;
      })
    };
    return sender;
  }

  function peerConnection(senders) {
    return {
      signalingState: 'stable',
      getSenders: () => senders,
      addTrack(track) {
        const createdSender = ratedSender('camera', track);
        senders.push(createdSender);
        return createdSender;
      },
      removeTrack(sender) {
        const index = senders.indexOf(sender);
        if (index >= 0) senders.splice(index, 1);
      }
    };
  }

  function mediaStream(tracks) {
    return {
      tracks,
      getTracks() {
        return this.tracks;
      },
      getAudioTracks() {
        return this.tracks.filter((track) => track.kind === 'audio');
      },
      getVideoTracks() {
        return this.tracks.filter((track) => track.kind === 'video');
      },
      addTrack(track) {
        this.tracks.push(track);
      },
      removeTrack(track) {
        this.tracks = this.tracks.filter((item) => item !== track);
      }
    };
  }

  function liveManager(peers) {
    const app = {
      connection: new EventEmitter(),
      browser: { lockNavigation() {} },
      options: { stun: { settings: {} } },
      storage: { saveOptions() {} }
    };
    const mod = {
      publicKey: 'local',
      room_obj: { call_peers: peers },
      applyCameraProfile: jest.fn(() => Promise.resolve()),
      applyScreenShareBitrate: jest.fn(),
      diagnostics: { record: jest.fn() },
      screen_share: false,
      stun: { peers: new Map() },
      CallInterface: { receiveLocalStream: jest.fn() },
      sendOffChainMessage: jest.fn(() => Promise.resolve())
    };
    const created = new StreamManager(app, mod, { video: false, audio: true });
    created.active = true;
    return { created, mod };
  }

  test('enabling the camera during screen sharing leaves both senders intact', async () => {
    const { created, mod } = liveManager(['peer-a']);
    const microphone = { kind: 'audio', enabled: true, readyState: 'live', stop: jest.fn() };
    const screenTrack = { kind: 'video', enabled: true, readyState: 'live' };
    const cameraTrack = { kind: 'video', enabled: true, readyState: 'live', stop: jest.fn() };
    const screenSender = ratedSender('screen', screenTrack);
    const senders = [screenSender];
    const connection = peerConnection(senders);
    mod.stun.peers.set('peer-a', connection);
    created.localStream = mediaStream([microphone]);
    global.navigator = {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [cameraTrack],
          getVideoTracks: () => [cameraTrack],
          getAudioTracks: () => []
        })
      }
    };

    await created.toggleVideo();

    const cameraSender = senders.find((sender) => sender.trackRole === 'camera');
    expect(cameraSender.track).toBe(cameraTrack);
    expect(screenSender.track).toBe(screenTrack);
    expect(screenSender.replaceTrack).not.toHaveBeenCalled();

    const stun = stunWith('peer-a', senders);
    await stun.setCameraSenderBitrate('peer-a', 1500000);
    await stun.setScreenSenderBitrate('peer-a', 500000);
    expect(cameraSender.parameters.encodings[0].maxBitrate).toBe(1500000);
    expect(screenSender.parameters.encodings[0].maxBitrate).toBe(500000);
  });

  test('replaces the camera on every peer and keeps the screen sender', async () => {
    const { created, mod } = liveManager(['peer-a', 'peer-b']);
    const oldCamera = { kind: 'video', readyState: 'live', stop: jest.fn() };
    const microphone = { kind: 'audio', readyState: 'live', stop: jest.fn() };
    const screenTrack = { kind: 'video', readyState: 'live' };
    const newCamera = { kind: 'video', readyState: 'live', stop: jest.fn() };
    const peers = ['peer-a', 'peer-b'].map((peerId) => {
      const cameraSender = ratedSender('camera', oldCamera);
      const screenSender = ratedSender('screen', screenTrack);
      const connection = peerConnection([cameraSender, screenSender]);
      mod.stun.peers.set(peerId, connection);
      return { cameraSender, screenSender };
    });
    created.localStream = mediaStream([microphone, oldCamera]);
    global.navigator = {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [newCamera],
          getVideoTracks: () => [newCamera],
          getAudioTracks: () => []
        })
      }
    };

    await created.updateInputs('video', 'camera-two');

    for (const peer of peers) {
      expect(peer.cameraSender.track).toBe(newCamera);
      expect(peer.screenSender.track).toBe(screenTrack);
      expect(peer.screenSender.replaceTrack).not.toHaveBeenCalled();
    }
    expect(oldCamera.stop).toHaveBeenCalledTimes(1);
    expect(microphone.stop).not.toHaveBeenCalled();
    expect(created.localStream.getVideoTracks()[0]).toBe(newCamera);
    expect(mod.applyCameraProfile).toHaveBeenCalled();
    expect(created.app.options.stun.settings.preferred_video).toBe('camera-two');
  });

  test('keeps the old camera when replacement fails', async () => {
    const { created, mod } = liveManager(['peer-a']);
    const oldCamera = { kind: 'video', readyState: 'live', stop: jest.fn() };
    const microphone = { kind: 'audio', readyState: 'live', stop: jest.fn() };
    const newCamera = { kind: 'video', readyState: 'live', stop: jest.fn() };
    const cameraSender = ratedSender('camera', oldCamera);
    cameraSender.replaceTrack = jest.fn(async () => {
      throw new Error('replace failed');
    });
    mod.stun.peers.set('peer-a', peerConnection([cameraSender]));
    created.localStream = mediaStream([microphone, oldCamera]);
    global.navigator = {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [newCamera],
          getVideoTracks: () => [newCamera],
          getAudioTracks: () => []
        })
      }
    };

    await created.updateInputs('video', 'camera-two');

    expect(created.localStream.getVideoTracks()[0]).toBe(oldCamera);
    expect(oldCamera.stop).not.toHaveBeenCalled();
    expect(newCamera.stop).toHaveBeenCalledTimes(1);
    expect(microphone.stop).not.toHaveBeenCalled();
    expect(mod.applyCameraProfile).not.toHaveBeenCalled();
    expect(mod.diagnostics.record).toHaveBeenCalled();
  });
});
