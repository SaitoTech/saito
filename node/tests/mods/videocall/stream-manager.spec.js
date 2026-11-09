const { EventEmitter } = require('events');
const StreamManager = require('../../../mods/videocall/lib/stream_manager');

const EVENTS = [
  'stun-connection-connected',
  'stun-update-connection-message',
  'stun-track-event',
  'stun-new-peer-connection'
];

global.Audio = class {
  play() {
    return Promise.resolve();
  }
};
global.siteMessage = () => {};

function callsOf(connection, event) {
  return connection.listeners(event).length;
}

function session() {
  const connection = new EventEmitter();
  const removedPeers = [];
  const app = {
    connection,
    browser: { lockNavigation() {}, unlockNavigation() {} },
    keychain: { addKey() {}, returnUsername: (key) => key },
    options: { stun: { settings: {} } },
    storage: { saveOptions() {} }
  };
  const mod = {
    publicKey: 'local-key',
    room_obj: { call_id: 'room-1', call_peers: ['peer-a'] },
    peerManager: {
      peers: new Map(),
      hasConnection() {
        return true;
      },
      removePeerConnection(peer) {
        removedPeers.push(peer);
      }
    },
    diagnostics: { record() {} },
    screen_share: false,
    sendOffChainMessage: jest.fn(() => Promise.resolve()),
    sendCallEntryTransaction: jest.fn(),
    async sendCallDisconnectTransaction() {
      for (const peer of this.room_obj.call_peers) {
        if (peer !== this.publicKey) this.peerManager.removePeerConnection(peer);
      }
    },
    CallInterface: { close: jest.fn() },
    resetCall() {
      this.streams?.releaseCall?.();
    }
  };

  return { app, mod, connection, removedPeers };
}

function manager(context, settings = { video: false, audio: true }) {
  const created = new StreamManager(context.app, context.mod, settings);
  context.mod.streams = created;
  return created;
}

function holdCamera(target, stream) {
  target.register({
    source: target.mod.publicKey,
    kind: 'camera',
    origin: 'local',
    session: 'call',
    availability: 'live',
    disposition: 'owned',
    mediaStream: stream,
    peerId: target.mod.publicKey
  });
}

function localStream() {
  const track = { stop: jest.fn(), kind: 'audio', enabled: true, readyState: 'live' };
  return {
    track,
    stream: {
      getTracks: () => [track],
      getAudioTracks: () => [track],
      getVideoTracks: () => []
    }
  };
}

async function settled() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('StreamManager lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('registers one listener for each call event when the call starts', () => {
    const context = session();
    const active = manager(context);

    for (const event of EVENTS) {
      expect(callsOf(context.connection, event)).toBe(0);
    }

    active.attach();

    for (const event of EVENTS) {
      expect(callsOf(context.connection, event)).toBe(1);
    }
  });

  test('hang-up removes listeners, stops local media, and keeps the manager', async () => {
    const context = session();
    const active = manager(context);
    const media = localStream();
    active.attach();
    active.active = true;
    holdCamera(active, media.stream);

    context.mod.streams.leaveCall();
    await settled();

    expect(context.mod.CallInterface.close).toHaveBeenCalledTimes(1);
    expect(media.track.stop).toHaveBeenCalledTimes(1);
    expect(context.removedPeers).toEqual(['peer-a']);
    for (const event of EVENTS) {
      expect(callsOf(context.connection, event)).toBe(0);
    }
    expect(context.mod.streams).toBe(active);
    expect(active.active).toBe(false);
    expect(active.find({ session: 'call' })).toBeNull();
  });

  test('cleanup is harmless the second time', async () => {
    const context = session();
    const active = manager(context);
    active.attach();
    active.active = true;
    holdCamera(active, localStream().stream);

    const first = active.leaveCall();
    const second = active.leaveCall();
    await first;
    await second;
    active.detach();

    expect(context.removedPeers).toEqual(['peer-a']);
    for (const event of EVENTS) {
      expect(callsOf(context.connection, event)).toBe(0);
    }
  });

  test('the same manager can start a second call without duplicate listeners', async () => {
    const context = session();
    const active = manager(context);
    active.attach();
    active.active = true;
    holdCamera(active, localStream().stream);

    context.mod.streams.leaveCall();
    await settled();

    active.attach();
    active.active = true;
    const media = localStream();
    holdCamera(active, media.stream);
    context.mod.sendOffChainMessage.mockClear();

    active.toggleAudio();

    expect(context.mod.sendOffChainMessage).toHaveBeenCalledTimes(1);
    expect(context.mod.sendOffChainMessage).toHaveBeenCalledWith('toggle-audio', {
      public_key: 'local-key',
      enabled: false
    });
    for (const event of EVENTS) {
      expect(callsOf(context.connection, event)).toBe(1);
    }
    expect(context.mod.streams).toBe(active);
  });

  test('media that arrives after hang-up does not revive the ended call', async () => {
    const context = session();
    const active = manager(context);
    let release;
    const lateTrack = { stop: jest.fn(), kind: 'audio', enabled: true, readyState: 'live' };
    global.navigator = {
      mediaDevices: {
        getUserMedia: () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                getTracks: () => [lateTrack],
                getAudioTracks: () => [lateTrack],
                getVideoTracks: () => []
              });
          })
      }
    };

    const starting = active.start();
    context.mod.streams.leaveCall();
    await settled();
    release();
    await starting;
    await settled();

    expect(lateTrack.stop).toHaveBeenCalledTimes(1);
    expect(active.localStream).toBeNull();
    expect(context.mod.sendCallEntryTransaction).not.toHaveBeenCalled();
    expect(active.active).toBe(false);
    expect(active.listening).toBe(false);
  });

  test('a stats sample that resolves after shutdown is ignored', async () => {
    const context = session();
    const active = manager(context);
    let release;
    context.mod.peerManager.peers.set('peer-a', {
      firstConnect: false,
      getStats: () =>
        new Promise((resolve) => {
          release = resolve;
        })
    });
    const samples = [];
    context.mod.CallInterface.updateConnectionStrength = () => samples.push(1);

    active.attach();
    active.active = true;
    jest.useFakeTimers();
    context.connection.emit('stun-connection-connected', 'peer-a');
    jest.advanceTimersByTime(1000);
    active.detach();
    release(
      new Map([
        [
          'inbound',
          {
            type: 'remote-inbound-rtp',
            kind: 'video',
            packetsReceived: 10,
            packetsLost: 0,
            jitter: 0,
            roundTripTime: 0
          }
        ]
      ])
    );
    await Promise.resolve();
    jest.useRealTimers();

    expect(samples).toEqual([]);
    expect(active.monitors).toEqual({});
  });
});

function track(kind = 'video') {
  return { kind, stop: jest.fn(), enabled: true, readyState: 'live' };
}

function media(tracks) {
  const list = [...tracks];
  return {
    getTracks: () => list,
    getAudioTracks: () => list.filter((item) => item.kind === 'audio'),
    getVideoTracks: () => list.filter((item) => item.kind === 'video'),
    addTrack(item) {
      if (!list.includes(item)) list.push(item);
    },
    removeTrack(item) {
      const index = list.indexOf(item);
      if (index >= 0) list.splice(index, 1);
    }
  };
}

describe('stream registry', () => {
  test('ids are independent of the source and one source can have several streams', () => {
    const context = session();
    const active = manager(context);
    const camera = active.register({
      source: 'peer-a',
      kind: 'camera',
      origin: 'remote',
      session: 'call',
      disposition: 'borrowed',
      mediaStream: media([track()]),
      peerId: 'peer-a'
    });
    const display = active.register({
      source: 'peer-a',
      kind: 'display',
      origin: 'remote',
      session: 'call',
      disposition: 'borrowed',
      mediaStream: media([track()]),
      peerId: 'peer-a'
    });

    expect(camera.id).not.toBe('peer-a');
    expect(display.id).not.toBe(camera.id);
    expect(camera.source).toBe('peer-a');
    expect(active.list({ source: 'peer-a' })).toHaveLength(2);
    expect(active.remoteStreams.has('peer-a')).toBe(true);
    expect(active.remoteStreams.has('presentation')).toBe(true);
  });

  test('a pending remote camera keeps its MediaStream when tracks arrive', () => {
    const context = session();
    const active = manager(context);
    const added = [];
    const updated = [];
    context.connection.on('videocall-stream-added', (entry) => added.push(entry.id));
    context.connection.on('videocall-stream-updated', (entry) => updated.push(entry.mediaStream));

    const pending = active.ensureRemote('peer-a');
    const stream = pending.mediaStream;
    const first = track('audio');
    const second = track('video');
    active.adoptTrack(pending, first);
    active.adoptTrack(pending, second);

    expect(pending.availability).toBe('live');
    expect(active.get(pending.id).mediaStream).toBe(stream);
    expect(stream.getTracks()).toEqual([first, second]);
    expect(added).toEqual([pending.id]);
    expect(updated).toEqual([stream, stream]);
  });

  test('owned tracks stop on removal and borrowed tracks do not', () => {
    const context = session();
    const active = manager(context);
    const owned = track();
    const borrowed = track();
    const mine = active.register({
      source: 'local-key',
      kind: 'camera',
      origin: 'local',
      session: 'call',
      disposition: 'owned',
      mediaStream: media([owned])
    });
    const theirs = active.register({
      source: 'peer-a',
      kind: 'camera',
      origin: 'remote',
      session: 'call',
      disposition: 'borrowed',
      mediaStream: media([borrowed]),
      peerId: 'peer-a'
    });

    active.remove(mine.id);
    active.remove(theirs.id);

    expect(owned.stop).toHaveBeenCalledTimes(1);
    expect(borrowed.stop).not.toHaveBeenCalled();
  });

  test('ending a call keeps an external stream and a second call can attach once', () => {
    const context = session();
    const active = manager(context);
    const externalTrack = track();
    active.attach();
    active.active = true;
    holdCamera(active, media([track()]));
    const external = active.registerExternal(media([externalTrack]), { source: 'game' });

    active.releaseCall();
    active.attach();

    expect(active.get(external.id).mediaStream.getTracks()[0]).toBe(externalTrack);
    expect(externalTrack.stop).not.toHaveBeenCalled();
    expect(active.find({ session: 'call' })).toBeNull();
    for (const event of EVENTS) {
      expect(callsOf(context.connection, event)).toBe(1);
    }
    expect(active.listening).toBe(true);
  });

  test('a composite keeps its id when the output stream is replaced and does not stop inputs', () => {
    const context = session();
    const active = manager(context);
    const input = track();
    const output = track();
    const replacement = track();
    const camera = active.register({
      source: 'local-key',
      kind: 'camera',
      origin: 'local',
      session: 'standalone',
      disposition: 'borrowed',
      mediaStream: media([input])
    });
    const composite = active.registerComposite(media([output]), { source: 'local-key' });

    active.update(composite.id, { mediaStream: media([replacement]) });
    active.remove(composite.id);

    expect(active.get(composite.id)).toBeNull();
    expect(camera.id).not.toBe(composite.id);
    expect(output.stop).toHaveBeenCalledTimes(1);
    expect(replacement.stop).toHaveBeenCalledTimes(1);
    expect(input.stop).not.toHaveBeenCalled();
    expect(active.get(camera.id)).toBe(camera);
  });
});
