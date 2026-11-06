const { EventEmitter } = require('events');
const StreamManager = require('../../../mods/videocall/lib/stream_manager');

const EVENTS = [
  'stun-toggle-video',
  'stun-toggle-audio',
  'begin-share-screen',
  'stop-share-screen',
  'stun-connection-connected',
  'stun-update-connection-message',
  'stun-track-event',
  'start-stun-call',
  'stun-new-peer-connection',
  'stun-disconnect'
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
    stun: {
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
        if (peer !== this.publicKey) this.stun.removePeerConnection(peer);
      }
    },
    CallInterface: { close: jest.fn() }
  };

  // Same cleanup the module performs on reset-stun.
  connection.on('reset-stun', () => {
    if (mod.streams) {
      mod.streams.detach();
      mod.streams = null;
    }
  });

  return { app, mod, connection, removedPeers };
}

function manager(context, settings = { video: false, audio: true }) {
  const created = new StreamManager(context.app, context.mod, settings);
  context.mod.streams = created;
  return created;
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

  test('registers one listener for each call event', () => {
    const context = session();
    manager(context);

    for (const event of EVENTS) {
      expect(callsOf(context.connection, event)).toBe(1);
    }
  });

  test('hang-up removes listeners, stops local media, and disconnects Stun peers', async () => {
    const context = session();
    const active = manager(context);
    const media = localStream();
    active.localStream = media.stream;

    context.connection.emit('stun-disconnect');
    await settled();

    expect(context.mod.CallInterface.close).toHaveBeenCalledTimes(1);
    expect(media.track.stop).toHaveBeenCalledTimes(1);
    expect(context.removedPeers).toEqual(['peer-a']);
    for (const event of EVENTS) {
      expect(callsOf(context.connection, event)).toBe(0);
    }
    expect(context.mod.streams).toBeNull();
  });

  test('cleanup is harmless the second time', async () => {
    const context = session();
    const active = manager(context);
    active.localStream = localStream().stream;

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

  test('only the manager for the current call responds', async () => {
    const context = session();
    const first = manager(context);
    first.localStream = localStream().stream;

    context.connection.emit('stun-disconnect');
    await settled();

    const second = manager(context);
    const media = localStream();
    second.localStream = media.stream;
    context.mod.sendOffChainMessage.mockClear();

    context.connection.emit('stun-toggle-audio');

    expect(context.mod.sendOffChainMessage).toHaveBeenCalledTimes(1);
    expect(context.mod.sendOffChainMessage).toHaveBeenCalledWith('toggle-audio', {
      public_key: 'local-key',
      enabled: false
    });
    for (const event of EVENTS) {
      expect(callsOf(context.connection, event)).toBe(1);
    }
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

    const starting = context.connection.listeners('start-stun-call')[0]();
    context.connection.emit('stun-disconnect');
    await settled();
    release();
    await starting;
    await settled();

    expect(lateTrack.stop).toHaveBeenCalledTimes(1);
    expect(active.localStream).toBeNull();
    expect(context.mod.sendCallEntryTransaction).not.toHaveBeenCalled();
    expect(active.detached).toBe(true);
  });

  test('a stats sample that resolves after shutdown is ignored', async () => {
    const context = session();
    const active = manager(context);
    let release;
    context.mod.stun.peers.set('peer-a', {
      firstConnect: false,
      getStats: () =>
        new Promise((resolve) => {
          release = resolve;
        })
    });
    const samples = [];
    context.connection.on('videocall-connection-strength', () => samples.push(1));

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
