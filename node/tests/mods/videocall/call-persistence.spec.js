const { EventEmitter } = require('events');
const Videocall = require('../../../mods/videocall/videocall');
const Streams = require('../../../mods/videocall/lib/streams');

const MAX_AGE = Videocall.CALL_RECORD_MAX_AGE_MS;

function keychain(entries) {
  return {
    entries,
    returnKey(id) {
      return entries.find((key) => key.publicKey === id) || null;
    },
    addKey(id, data) {
      const key = this.returnKey(id);
      if (key) Object.assign(key, data);
    }
  };
}

function harness() {
  const saved = jest.fn();
  const entries = [
    { publicKey: 'room-1', mod: 'videocall', type: 'event', watched: true, identifier: 'Video Call' },
    { publicKey: 'friend', mod: 'chat', watched: true, identifier: 'Friend' }
  ];
  const created = Object.create(Videocall.prototype);
  created.app = {
    options: {
      videocall: {
        settings: { mode: 'default' }
      }
    },
    storage: { saveOptions: saved },
    keychain: keychain(entries)
  };
  created.room_obj = { call_id: 'room-1', host_public_key: 'host', ui: 'video', call_peers: [] };
  created.recoveryTabId = () => 'tab-1';
  created.swarmcast = {
    id: 'pub-1',
    callId: 'room-1',
    broadcaster: 'host',
    show: 'participants',
    parent: '',
    former_children: [],
    max_slots: 4,
    ended: false,
    departing: false
  };
  return { created, saved, entries };
}

describe('call persistence', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('an explicit exit removes this call and leaves settings and other calls', () => {
    const { created, saved, entries } = harness();
    const now = Date.now();
    created.app.options.videocall.session = {
      call_id: 'room-1',
      status: 'live',
      created_at: now,
      updated_at: now,
      heartbeat: now
    };
    created.app.options.videocall.recovery = {
      publication_id: 'pub-1',
      call_id: 'room-1',
      status: 'live',
      created_at: now,
      updated_at: now,
      heartbeat: now
    };

    created.clearPersistedCall('room-1');

    expect(created.app.options.videocall.session).toBeNull();
    expect(created.app.options.videocall.recovery).toBeNull();
    expect(created.app.options.videocall.settings).toEqual({ mode: 'default' });
    expect(entries[0]).toMatchObject({ ended: true, watched: false, identifier: 'Video Call' });
    expect(entries[1]).toEqual({ publicKey: 'friend', mod: 'chat', watched: true, identifier: 'Friend' });
    expect(saved).toHaveBeenCalled();
  });

  test('ending one call does not remove a different publication', () => {
    const { created } = harness();
    const now = Date.now();
    created.app.options.videocall.recovery = {
      publication_id: 'pub-2',
      call_id: 'room-2',
      status: 'live',
      created_at: now,
      updated_at: now,
      heartbeat: now
    };

    created.clearPersistedCall('room-1');

    expect(created.app.options.videocall.recovery.call_id).toBe('room-2');
  });

  test('End Call clears the persisted record for the room that is ending', async () => {
    global.Audio = class {
      play() {
        return Promise.resolve();
      }
    };
    global.siteMessage = () => {};
    const { created } = harness();
    created.clearPersistedCall = jest.fn();
    created.swarmcast = null;
    created.resetCall = jest.fn();
    created.sendCallDisconnectTransaction = () => Promise.resolve();
    created.screen_share = false;
    const streams = new Streams(
      {
        connection: new EventEmitter(),
        browser: { lockNavigation() {}, unlockNavigation() {} },
        keychain: { addKey: jest.fn(), returnUsername: (key) => key },
        options: created.app.options,
        storage: created.app.storage
      },
      created
    );
    created.streams = streams;
    streams.active = true;

    await streams.leaveCall();

    expect(created.clearPersistedCall).toHaveBeenCalledWith('room-1');
  });

  test('a refresh keeps a live record and rewrites its heartbeat', () => {
    jest.useFakeTimers();
    const started = 1_700_000_000_000;
    jest.setSystemTime(started);
    const { created } = harness();
    created.ownSwarmcastRecovery = jest.fn();
    created.persistCallState();
    created.persistSwarmcastState();

    const stale = started - MAX_AGE - 1;
    created.app.options.videocall.session.created_at = stale;
    created.app.options.videocall.session.updated_at = stale;
    created.app.options.videocall.session.heartbeat = stale;
    created.app.options.videocall.recovery.created_at = stale;
    created.app.options.videocall.recovery.updated_at = stale;
    created.app.options.videocall.recovery.heartbeat = stale;

    const streams = Object.create(Streams.prototype);
    streams.mod = created;
    streams.visibilityChange();
    created.persistSwarmcastState();

    expect(created.app.options.videocall.session.heartbeat).toBe(started);
    expect(created.app.options.videocall.recovery.heartbeat).toBe(started);
    expect(created.app.options.videocall.session.updated_at).toBe(stale);
    expect(created.app.options.videocall.recovery.updated_at).toBe(stale);
    expect(created.expireStaleCallRecords()).toBe(false);
    expect(created.app.options.videocall.session.call_id).toBe('room-1');
    expect(created.app.options.videocall.recovery.publication_id).toBe('pub-1');
  });

  test('timestamps stay fixed until the record changes', () => {
    jest.useFakeTimers();
    const started = 1_700_000_000_000;
    jest.setSystemTime(started);
    const { created } = harness();
    created.persistCallState();
    created.persistSwarmcastState();

    jest.setSystemTime(started + 1000);
    created.persistCallState();
    created.persistSwarmcastState();
    expect(created.app.options.videocall.session.created_at).toBe(started);
    expect(created.app.options.videocall.session.updated_at).toBe(started);
    expect(created.app.options.videocall.recovery.created_at).toBe(started);
    expect(created.app.options.videocall.recovery.updated_at).toBe(started);
    expect(created.app.options.videocall.recovery.heartbeat).toBe(started + 1000);

    jest.advanceTimersByTime(5000);
    expect(created.app.options.videocall.recovery.updated_at).toBe(started);
    expect(created.app.options.videocall.recovery.heartbeat).toBe(started + 6000);

    created.room_obj.call_peers = ['peer-a'];
    created.swarmcast.parent = 'parent-b';
    jest.setSystemTime(started + 2000);
    created.persistCallState();
    created.persistSwarmcastState();
    expect(created.app.options.videocall.session.created_at).toBe(started);
    expect(created.app.options.videocall.session.updated_at).toBe(started + 2000);
    expect(created.app.options.videocall.recovery.created_at).toBe(started);
    expect(created.app.options.videocall.recovery.updated_at).toBe(started + 2000);
    expect(created.app.options.videocall.recovery.active_parent).toBe('parent-b');
    created.clearSwarmcastRecovery();
  });

  test('initialization drops a record that has exceeded its maximum age', () => {
    const { created, saved, entries } = harness();
    const stale = Date.now() - MAX_AGE - 1;
    created.app.options.videocall.session = {
      call_id: 'room-1',
      status: 'live',
      created_at: stale,
      updated_at: stale,
      heartbeat: stale
    };
    created.app.options.videocall.recovery = {
      publication_id: 'pub-1',
      call_id: 'room-1',
      status: 'live',
      broadcaster: 'host',
      active_parent: 'parent-b'
    };

    created.swarmcast = null;
    expect(created.restoreSwarmcast()).toBeNull();
    expect(created.swarmcast).toBeNull();
    expect(created.app.options.videocall.session).toBeNull();
    expect(created.app.options.videocall.recovery).toBeNull();
    expect(created.app.options.videocall.settings).toEqual({ mode: 'default' });
    expect(entries[0]).toMatchObject({ ended: true, watched: false });
    expect(entries[1].watched).toBe(true);
    expect(saved).toHaveBeenCalled();
  });

  function liveSession(role) {
    const now = Date.now();
    const created = Object.create(Videocall.prototype);
    const originator = role === 'originator';
    created.publicKey = originator ? 'host' : 'guest';
    created.room_obj = null;
    created.createRoom = jest.fn();
    created.app = {
      options: {
        videocall: {
          settings: { mode: 'default' },
          session: {
            call_id: 'room-1',
            host_public_key: 'host',
            ui: 'video',
            call_peers: originator ? ['guest'] : ['host'],
            status: 'live',
            created_at: now,
            updated_at: now,
            heartbeat: now
          }
        }
      },
      storage: { saveOptions: jest.fn() }
    };
    created.streams = { active: false, start: jest.fn(() => Promise.resolve()) };
    created.initializeCallInterface = jest.fn(function () {
      this.streams.active = true;
      this.CallInterface = {};
    });
    Object.defineProperty(created, 'peers', { value: { connect: jest.fn() } });
    created.sendCallJoinTransaction = jest.fn();
    created.sendCallEntryTransaction = jest.fn();
    created.app.BROWSER = 1;
    return created;
  }

  async function relayUp(created) {
    await created.onPeerServiceUp(created.app, {}, { service: 'relay' });
  }

  test('an originator refresh restores the call and connects after the relay is up', async () => {
    const created = liveSession('originator');

    created.restoreCall();

    expect(created.createRoom).not.toHaveBeenCalled();
    expect(created.room_obj).toMatchObject({
      call_id: 'room-1',
      host_public_key: 'host',
      ui: 'video',
      call_peers: ['guest']
    });
    expect(created.initializeCallInterface).toHaveBeenCalledWith({
      ui: 'video',
      audio: true,
      video: true
    });
    expect(created.streams.start).toHaveBeenCalledTimes(1);
    expect(created.peers.connect).not.toHaveBeenCalled();
    expect(created.sendCallEntryTransaction).not.toHaveBeenCalled();

    await relayUp(created);

    expect(created.peers.connect).toHaveBeenCalledWith('guest', {
      role: 'offer',
      onReady: expect.any(Function)
    });
    expect(created.sendCallEntryTransaction).toHaveBeenCalledTimes(1);
    created.peers.connect.mock.calls[0][1].onReady('guest');
    expect(created.sendCallJoinTransaction).toHaveBeenCalledWith('guest');
  });

  test('a restored video call waits for the camera before connecting', async () => {
    const created = liveSession('originator');
    let releaseMedia;
    created.streams.start = jest.fn(
      () =>
        new Promise((resolve) => {
          releaseMedia = resolve;
        })
    );
    created.app.options.videocall.session.ui = '';
    delete created.app.options.videocall.session.video;

    created.restoreCall();
    const pending = created.onPeerServiceUp(created.app, {}, { service: 'relay' });
    await Promise.resolve();

    expect(created.initializeCallInterface).toHaveBeenCalledWith({
      ui: 'video',
      audio: true,
      video: true
    });
    expect(created.peers.connect).not.toHaveBeenCalled();

    releaseMedia();
    await pending;
    expect(created.peers.connect).toHaveBeenCalledWith('guest', {
      role: 'offer',
      onReady: expect.any(Function)
    });
  });

  test('a restored voice call does not open the camera', () => {
    const created = liveSession('originator');
    created.app.options.videocall.session.ui = 'voice';
    created.app.options.videocall.session.video = false;

    created.restoreCall();

    expect(created.initializeCallInterface).toHaveBeenCalledWith({
      ui: 'voice',
      audio: true,
      video: false
    });
  });

  test('confirming a restored call starts playback', async () => {
    const created = liveSession('originator');
    const previous = global.sconfirm;
    const play = jest.fn(() => Promise.resolve());
    const video = { play };
    const previousDocument = global.document;
    global.document = {
      querySelectorAll: () => [video]
    };
    global.sconfirm = async (message) => {
      expect(message).toBe('continue videocall?');
      return true;
    };

    created.restoreCall();
    await created.playback_prompt;

    expect(created.playback_allowed).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    global.document = previousDocument;
    global.sconfirm = previous;
  });

  test('canceling a restored swarmcast ends the call', async () => {
    const created = liveSession('originator');
    const previous = global.sconfirm;
    created.swarmcast = { id: 'pub-1' };
    created.streams.leaveCall = jest.fn(() => Promise.resolve());
    created.departBroadcast = jest.fn(() => Promise.resolve());
    global.sconfirm = async (message) => {
      expect(message).toBe('continue swarmcast?');
      return false;
    };

    created.restoreCall();
    await created.playback_prompt;

    expect(created.streams.leaveCall).toHaveBeenCalledTimes(1);
    expect(created.departBroadcast).not.toHaveBeenCalled();
    expect(created.call_reconnect).toBe(false);
    expect(created.playback_allowed).toBe(false);
    global.sconfirm = previous;
  });

  test('an invited participant connects to the originator after the relay is up', async () => {
    const created = liveSession('guest');

    created.restoreCall();

    expect(created.room_obj.call_id).toBe('room-1');
    expect(created.room_obj.host_public_key).toBe('host');
    expect(created.peers.connect).not.toHaveBeenCalled();

    await relayUp(created);

    expect(created.streams.start).toHaveBeenCalledTimes(1);
    expect(created.peers.connect).toHaveBeenCalledWith('host', {
      role: 'offer',
      onReady: expect.any(Function)
    });
  });

  test('an explicit exit leaves nothing for a later refresh to restore', async () => {
    const created = liveSession('originator');
    created.app.keychain = keychain([
      { publicKey: 'room-1', mod: 'videocall', type: 'event', watched: true }
    ]);
    created.clearPersistedCall('room-1');

    expect(created.restoreCall()).toBeNull();
    await relayUp(created);
    expect(created.initializeCallInterface).not.toHaveBeenCalled();
    expect(created.streams.start).not.toHaveBeenCalled();
    expect(created.peers.connect).not.toHaveBeenCalled();
    expect(created.sendCallEntryTransaction).not.toHaveBeenCalled();
    expect(created.room_obj).toBeNull();
  });
});
