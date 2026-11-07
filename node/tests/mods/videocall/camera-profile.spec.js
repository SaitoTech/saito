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

  test('leaves capture and senders unchanged when the mode is not default', async () => {
    const videocall = call();
    videocall.app.options.videocall = { settings: { mode: 'unlimited' } };
    videocall.room_obj.call_peers = ['a'];
    await videocall.applyCameraProfile();
    expect(videocall.streams.setCameraCapture).not.toHaveBeenCalled();
    expect(videocall.stun.setCameraSenderBitrate).not.toHaveBeenCalled();
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
