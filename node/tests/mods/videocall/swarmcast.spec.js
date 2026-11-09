const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { Swarmcast, Swarmcasts, syncSenders, trackMap } = require('../../../mods/videocall/lib/swarmcast');
const Videocall = require('../../../mods/videocall/videocall');

class FakeStream {
  constructor(tracks = []) {
    this.tracks = tracks.slice();
    this.listeners = {};
  }
  getTracks() {
    return this.tracks.filter((track) => track.readyState !== 'ended');
  }
  getAudioTracks() {
    return this.getTracks().filter((track) => track.kind === 'audio');
  }
  getVideoTracks() {
    return this.getTracks().filter((track) => track.kind === 'video');
  }
  addTrack(track) {
    this.tracks.push(track);
    for (const listener of this.listeners.addtrack || []) listener();
  }
  removeTrack(track) {
    this.tracks = this.tracks.filter((item) => item !== track);
  }
  addEventListener(name, listener) {
    this.listeners[name] ||= [];
    this.listeners[name].push(listener);
  }
  removeEventListener(name, listener) {
    this.listeners[name] = (this.listeners[name] || []).filter((item) => item !== listener);
  }
}

function track(kind, id = kind) {
  return {
    kind,
    id,
    readyState: 'live',
    stop() {
      this.stopped = true;
      this.readyState = 'ended';
    },
    addEventListener() {}
  };
}

function peerConnection() {
  const pc = {
    signalingState: 'stable',
    added: [],
    removed: [],
    transceivers: [],
    addTrack(media) {
      const sender = {
        track: media,
        replaceTrack(next) {
          this.track = next;
          return Promise.resolve();
        }
      };
      const transceiver = { sender, mid: String(pc.transceivers.length), direction: 'sendonly', stopped: false };
      pc.transceivers.push(transceiver);
      pc.added.push(media);
      return sender;
    },
    removeTrack(sender) {
      pc.removed.push(sender);
      const transceiver = pc.transceivers.find((item) => item.sender === sender);
      if (transceiver) transceiver.direction = 'inactive';
    },
    getTransceivers() {
      return pc.transceivers;
    }
  };
  return pc;
}

function harness() {
  const sent = [];
  const removed = [];
  const mod = Object.create(Videocall.prototype);
  mod.publicKey = 'alice';
  mod.app = {
    connection: new EventEmitter(),
    keychain: { returnUsername: (key) => key.slice(0, 4) }
  };
  mod.room_obj = { call_id: 'room-1', call_peers: ['bob'] };
  mod.streams = {
    active: true,
    entries: new Map(),
    get(id) {
      return this.entries.get(id) || null;
    },
    find(filter) {
      return [...this.entries.values()].find((entry) =>
        Object.entries(filter).every(([key, value]) => entry[key] === value)
      );
    },
    list(filter) {
      return [...this.entries.values()].filter((entry) =>
        Object.entries(filter).every(([key, value]) => entry[key] === value)
      );
    },
    releaseCall() {
      this.released = true;
    }
  };
  mod.peerManager = {
    peers: new Map(),
    removed,
    hasConnectionWithPeer: () => true,
    sendTransaction(_peer, tx) {
      sent.push(tx.msg);
    },
    removePeerConnection(peerId) {
      removed.push(peerId);
      this.peers.delete(peerId);
    },
    createPeerConnection(peerId, callback) {
      this.created = peerId;
      this.createdCount = (this.createdCount || 0) + 1;
      this.peers.set(peerId, { connectionState: 'new' });
      callback?.(peerId);
    },
    sendJoinTransaction(peerId) {
      this.joined = peerId;
      return Promise.resolve();
    }
  };
  mod.sent = sent;
  mod.sendSwarmcast = async function (publicKey, request, data) {
    sent.push({ to: publicKey, request, data });
  };
  mod.createShortLink = async (url) => url;
  return mod;
}

test('public publication documents omit registry ids', () => {
  const pub = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  pub.addCamera({ registryId: 'registry-alice', participant: 'alice', label: 'Alice' });
  pub.addCamera({ registryId: 'registry-bob', participant: 'bob', label: 'Bob' });
  pub.outputs.push({ id: 'program', label: 'Call', inputs: ['cam-1', 'cam-2'], registryId: 'composite-1' });
  const doc = pub.document();
  assert.equal(JSON.stringify(doc).includes('registry'), false);
  assert.equal(doc.id, 'pub');
  assert.equal(doc.broadcaster, 'alice');
  assert.deepEqual(doc.outputs[0], {
    id: 'cam-1',
    role: 'video',
    kind: 'camera',
    label: 'Alice',
    participant: '',
    camera: 'live',
    inputs: ['cam-1']
  });
  assert.deepEqual(doc.outputs[1].inputs, ['cam-2']);
  assert.deepEqual(doc.outputs[2].inputs, ['cam-1', 'cam-2']);
  assert.equal(pub.streamFor(pub.outputs[2], { get: (id) => ({ mediaStream: id }) }), 'composite-1');
});

test('multiple outputs map to distinct mids', () => {
  const pc = peerConnection();
  const senders = [];
  const alice = new FakeStream([track('video', 'a-v'), track('audio', 'a-a')]);
  const bob = new FakeStream([track('video', 'b-v'), track('audio', 'b-a')]);
  syncSenders(pc, senders, [{ id: 'cam-1' }, { id: 'cam-2' }], (output) =>
    output.id === 'cam-1' ? alice : bob
  );
  const map = trackMap(senders, pc);
  assert.deepEqual(map, [
    { id: 'cam-1', mids: [{ mid: '0', kind: 'video' }, { mid: '1', kind: 'audio' }] },
    { id: 'cam-2', mids: [{ mid: '2', kind: 'video' }, { mid: '3', kind: 'audio' }] }
  ]);
  assert.equal(new Set(map.flatMap((output) => output.mids.map((item) => item.mid))).size, 4);
});

test('replacing a live track keeps the sender and mid', async () => {
  const pc = peerConnection();
  const senders = [];
  const video = track('video');
  const audio = track('audio');
  syncSenders(pc, senders, [{ id: 'cam-1' }], () => new FakeStream([video, audio]));
  const sender = senders[0].sender;
  const replacement = track('video', 'next');
  syncSenders(pc, senders, [{ id: 'cam-1' }], () => new FakeStream([replacement, audio]));
  await Promise.resolve();
  assert.equal(senders[0].sender, sender);
  assert.equal(sender.track, replacement);
  assert.equal(pc.added.length, 2);
  assert.equal(pc.removed.length, 0);
  assert.equal(trackMap(senders, pc)[0].mids[0].mid, '0');
});

test('removing one output retires only that output and leaves its mid in place', () => {
  const pc = peerConnection();
  const senders = [];
  syncSenders(
    pc,
    senders,
    [{ id: 'cam-1' }, { id: 'cam-2' }],
    (output) => new FakeStream([track('video', output.id), track('audio', output.id)])
  );
  syncSenders(pc, senders, [{ id: 'cam-1' }], () => new FakeStream([track('video', 'cam-1'), track('audio', 'cam-1')]));
  assert.deepEqual(senders.map((item) => item.outputId), ['cam-1', 'cam-1']);
  assert.equal(pc.removed.length, 2);
  assert.equal(pc.getTransceivers().filter((item) => item.direction === 'inactive').length, 2);
  assert.deepEqual(trackMap(senders, pc), [
    { id: 'cam-1', mids: [{ mid: '0', kind: 'video' }, { mid: '1', kind: 'audio' }] }
  ]);
});

function camera(id, peerId, origin, media) {
  return {
    id,
    kind: 'camera',
    origin,
    session: 'call',
    peerId,
    mediaStream: media
  };
}

test('starting a broadcast publishes every active camera', () => {
  const mod = harness();
  const alice = camera('registry-alice', 'alice', 'local', new FakeStream([track('video', 'a'), track('audio', 'a')]));
  const bob = camera('registry-bob', 'bob', 'remote', new FakeStream([track('video', 'b'), track('audio', 'b')]));
  const display = {
    id: 'registry-screen',
    kind: 'display',
    origin: 'local',
    session: 'call',
    mediaStream: new FakeStream([track('video', 'screen')])
  };
  mod.streams.entries.set(alice.id, alice);
  mod.streams.entries.set(bob.id, bob);
  mod.streams.entries.set(display.id, display);
  mod.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.swarmcastSelection = {
    video: { mode: 'everyone', participant: '', participants: [] },
    audio: { mode: 'everyone', participant: '', participants: [] }
  };
  mod.publishCallCameras();
  const doc = mod.swarmcast.document();
  assert.deepEqual(
    doc.outputs.filter((output) => output.role === 'video').map((output) => output.label),
    ['You', 'bob']
  );
  assert.deepEqual(
    doc.outputs.filter((output) => output.role === 'audio').map((output) => output.participant),
    ['alice', 'bob']
  );
  assert.equal(JSON.stringify(doc).includes('registry'), false);
  assert.equal(JSON.stringify(doc).includes('screen'), false);
  assert.equal(mod.sent.some((message) => String(message.request).includes('consent')), false);
});

test('a camera that appears during a broadcast is published', () => {
  const mod = harness();
  mod.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.swarmcastSelection = {
    video: { mode: 'everyone', participant: '', participants: [] },
    audio: { mode: 'everyone', participant: '', participants: [] }
  };
  const alice = camera('registry-alice', 'alice', 'local', new FakeStream([track('video')]));
  const bob = camera('registry-bob', 'bob', 'remote', new FakeStream([track('video'), track('audio')]));
  mod.streams.entries.set(alice.id, alice);
  mod.streams.entries.set(bob.id, bob);
  mod.noteBroadcastCamera(alice);
  mod.noteBroadcastCamera(bob);
  assert.deepEqual(
    mod.swarmcast.outputs.filter((output) => output.role === 'video').map((output) => output.participant),
    ['alice', 'bob']
  );
  assert.deepEqual(
    mod.swarmcast.outputs.filter((output) => output.role === 'audio').map((output) => output.participant),
    ['bob']
  );
});

test('a participant leaving removes only their output', () => {
  const mod = harness();
  const pc = peerConnection();
  mod.peerManager.peers.set('viewer', pc);
  const alice = camera('registry-alice', 'alice', 'local', new FakeStream([track('video', 'a'), track('audio', 'a')]));
  const bob = camera('registry-bob', 'bob', 'remote', new FakeStream([track('video', 'b'), track('audio', 'b')]));
  mod.streams.entries.set(alice.id, alice);
  mod.streams.entries.set(bob.id, bob);
  mod.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.swarmcastSelection = {
    video: { mode: 'everyone', participant: '', participants: [] },
    audio: { mode: 'everyone', participant: '', participants: [] }
  };
  mod.publishCallCameras();
  mod.swarmcast.addChild('viewer');
  mod.pushBroadcast();
  mod.listenForBroadcastChanges();
  mod.app.connection.emit('videocall-stream-removed', bob);
  assert.deepEqual(
    mod.swarmcast.outputs.map((output) => output.participant),
    ['alice', 'alice']
  );
  assert.equal(pc.removed.length, 2);
  assert.equal(pc.transceivers.filter((item) => item.direction === 'sendonly').length, 2);
  mod.stopBroadcast();
});

test('a connected viewer receives a camera added after it subscribed', async () => {
  const mod = harness();
  const pc = peerConnection();
  mod.peerManager.peers.set('viewer', pc);
  const alice = camera('registry-alice', 'alice', 'local', new FakeStream([track('video', 'a'), track('audio', 'a')]));
  mod.streams.entries.set(alice.id, alice);
  mod.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.swarmcastSelection = {
    video: { mode: 'everyone', participant: '', participants: [] },
    audio: { mode: 'everyone', participant: '', participants: [] }
  };
  mod.publishCallCameras();
  mod.acceptBroadcastSubscribe('viewer', { publicationId: 'pub', outputIds: ['cam-1'] });
  const subscribed = mod.sent.filter((message) => message.request === 'video-call-swarmcast-subscribe');
  const bob = camera('registry-bob', 'bob', 'remote', new FakeStream([track('video', 'b'), track('audio', 'b')]));
  mod.streams.entries.set(bob.id, bob);
  mod.noteBroadcastCamera(bob);
  await Promise.resolve();
  const senders = mod.swarmcast.childFor('viewer').media_streams;
  assert.deepEqual(
    senders.map((item) => item.outputId),
    ['cam-1', 'aud-1', 'cam-2', 'aud-2']
  );
  assert.equal(senders[0].sender, pc.transceivers[0].sender);
  const update = mod.sent.filter((message) => message.request === 'video-call-swarmcast-tracks').at(-1);
  assert.equal(update.data.publication.outputs.length, 4);
  assert.equal(update.data.outputs.some((output) => output.id === 'cam-2'), true);
  assert.equal(subscribed.length, 0);
});

test('an added source track replaces the sender before the old track stops', async () => {
  const mod = harness();
  const pc = peerConnection();
  mod.peerManager.peers.set('viewer', pc);
  const oldVideo = track('video', 'old');
  const audio = track('audio');
  const stream = new FakeStream([oldVideo, audio]);
  mod.streams.entries.set('registry-alice', {
    id: 'registry-alice',
    kind: 'camera',
    origin: 'local',
    session: 'call',
    peerId: 'alice',
    mediaStream: stream
  });
  mod.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.swarmcastSelection = {
    video: { mode: 'everyone', participant: '', participants: [] },
    audio: { mode: 'everyone', participant: '', participants: [] }
  };
  mod.swarmcast.addCamera({ registryId: 'registry-alice', participant: 'alice', label: 'You' });
  const senders = [];
  syncSenders(pc, senders, mod.swarmcast.outputs, (output) => mod.swarmcast.streamFor(output, mod.streams));
  const child = mod.swarmcast.addChild('viewer');
  child.media_streams = senders;
  mod.listenForBroadcastChanges();
  mod.bindBroadcastSources();
  const next = track('video', 'next');
  stream.removeTrack(oldVideo);
  stream.addTrack(next);
  await Promise.resolve();
  assert.equal(senders[0].sender, pc.transceivers[0].sender);
  assert.equal(senders[0].sender.track, next);
  assert.equal(pc.removed.length, 0);
  assert.equal(trackMap(senders, pc)[0].mids[0].mid, '0');
  oldVideo.stop();
  assert.equal(senders[0].sender.track.readyState, 'live');
  mod.stopBroadcast();
});

test('publication termination tells children and does not stop call tracks', async () => {
  const mod = harness();
  const video = track('video');
  mod.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  const child = mod.swarmcast.addChild('viewer');
  child.media_streams = [{ sender: { track: video } }];
  mod.peerManager.peers.set('viewer', { signalingState: 'stable' });
  mod._onBroadcastSignaling = () => {};
  mod._broadcastSources = new Set();
  mod.stopBroadcast();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mod.swarmcast, null);
  assert.equal(mod.sent[0].request, 'video-call-swarmcast-ended');
  assert.equal(mod.sent[0].data.publicationId, 'pub');
  assert.deepEqual(mod.peerManager.removed, ['viewer']);
  assert.equal(video.stopped, undefined);
  assert.equal(mod.streams.released, undefined);
});

test('track maps are sent only after signaling is stable', async () => {
  const mod = harness();
  const pc = peerConnection();
  pc.signalingState = 'have-local-offer';
  mod.peerManager.peers.set('viewer', pc);
  mod.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.swarmcast.addCamera({ registryId: 'registry-alice', participant: 'alice', label: 'You' });
  const video = track('video');
  mod.streams.entries.set('registry-alice', {
    id: 'registry-alice',
    mediaStream: new FakeStream([video])
  });
  const senders = [];
  syncSenders(pc, senders, mod.swarmcast.outputs, (output) => mod.swarmcast.streamFor(output, mod.streams));
  const child = mod.swarmcast.addChild('viewer');
  child.media_streams = senders;
  mod.publishTrackMap('viewer');
  assert.equal(mod.sent.length, 0);
  pc.signalingState = 'stable';
  mod.publishTrackMap('viewer');
  await Promise.resolve();
  assert.equal(mod.sent[0].request, 'video-call-swarmcast-tracks');
  assert.equal(mod.sent[0].data.outputs[0].mids[0].mid, '0');
  assert.equal(JSON.stringify(mod.sent[0].data).includes('registry'), false);
});

test('viewer initialization dials Stun and does not join the call', async () => {
  const mod = harness();
  mod.sendCallJoinTransaction = () => {
    throw new Error('call membership join');
  };
  mod.sendCallEntryTransaction = () => {
    throw new Error('call entry');
  };
  global.MediaStream = FakeStream;
  global.window = {
    location: {
      pathname: '/videocall/swarmcast/pub',
      search: '?broadcaster=alice&call_id=room-1',
      origin: 'https://saito.example'
    },
    addEventListener() {},
    removeEventListener() {}
  };
  const outputs = { appendChild() {}, children: [] };
  const status = {
    dataset: {},
    querySelector(selector) {
      return { textContent: '', selector };
    }
  };
  global.document = {
    body: { appendChild() {} },
    createElement() {
      return {
        innerHTML: '',
        firstElementChild: {},
        children: [],
        dataset: {},
        appendChild(child) {
          this.children.push(child);
        },
        querySelector() {
          return { textContent: '' };
        },
        remove() {}
      };
    },
    querySelector(selector) {
      if (selector === '.swarmcast-viewer') return null;
      if (selector === '.swarmcast-outputs') return outputs;
      if (selector.includes('swarmcast-status')) return status;
      return null;
    }
  };
  const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
  mod.isRelayConnected = true;
  const viewer = new SwarmcastViewer(mod, mod, {
    publicationId: 'pub',
    broadcaster: 'alice',
    callId: 'room-1'
  });
  viewer.app = { connection: new EventEmitter() };
  const route = mod.readSwarmcastRoute();
  assert.deepEqual(route, { publicationId: 'pub', broadcaster: 'alice', callId: 'room-1' });
  viewer.render();
  assert.equal(mod.peerManager.created, undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mod.sent[0].request, 'video-call-swarmcast-join-request');
  viewer.receiveJoin({
    publicationId: 'pub',
    state: 'ready',
    contact: 'alice',
    publication: {
      id: 'pub',
      callId: 'room-1',
      broadcaster: 'alice',
      inputs: [{ id: 'cam-1', kind: 'camera', label: 'You', participant: 'alice' }],
      outputs: [
        { id: 'cam-1', label: 'You', inputs: ['cam-1'] },
        { id: 'cam-2', label: 'Bob', inputs: ['cam-2'] }
      ]
    }
  });
  assert.equal(mod.peerManager.joined, 'alice');
  assert.equal(mod.peerManager.created, 'alice');
  const video = track('video', 'remote-video');
  const audio = track('audio', 'remote-audio');
  const other = track('video', 'remote-bob');
  viewer.onTrack('alice', { track: video, streams: [{ id: 'wrong-stream' }], transceiver: { mid: '0' } });
  viewer.onTrack('alice', { track: audio, streams: [], transceiver: { mid: '1' } });
  viewer.onTrack('alice', { track: other, streams: [{ id: 'also-wrong' }], transceiver: { mid: '2' } });
  assert.equal(viewer.media.get('cam-1').getTracks().length, 0);
  viewer.receiveTracks({
    publicationId: 'pub',
    publication: viewer.publication,
    outputs: [
      { id: 'cam-1', mids: [{ mid: '0', kind: 'video' }, { mid: '1', kind: 'audio' }] },
      { id: 'cam-2', mids: [{ mid: '2', kind: 'video' }] }
    ]
  });
  assert.deepEqual(viewer.media.get('cam-1').getTracks(), [video]);
  assert.deepEqual(viewer.media.get('cam-1:audio').getTracks(), [audio]);
  assert.deepEqual(viewer.media.get('cam-2').getTracks(), [other]);
  viewer.receiveTracks({
    publicationId: 'pub',
    publication: {
      ...viewer.publication,
      outputs: [{ id: 'cam-1', label: 'You', inputs: ['cam-1'] }]
    },
    outputs: [{ id: 'cam-1', mids: [{ mid: '0', kind: 'video' }, { mid: '1', kind: 'audio' }] }]
  });
  assert.equal(viewer.media.has('cam-2'), false);
  assert.deepEqual(viewer.media.get('cam-1').getTracks(), [video]);
  assert.deepEqual(viewer.media.get('cam-1:audio').getTracks(), [audio]);
  viewer.receiveEnded({ publicationId: 'pub' });
  assert.equal(viewer.state, 'ended');
  assert.equal(viewer.closed, true);
  assert.deepEqual(mod.peerManager.removed, ['alice']);
  assert.equal(viewer.media.size, 0);
});

function installViewerDocument() {
  const outputs = { appendChild() {}, children: [] };
  const status = { dataset: {}, querySelector: () => ({ textContent: '' }) };
  global.MediaStream = FakeStream;
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.document = {
    body: { appendChild() {} },
    createElement() {
      return {
        innerHTML: '',
        firstElementChild: {},
        children: [],
        dataset: {},
        appendChild(child) {
          this.children.push(child);
        },
        querySelector: () => ({ textContent: '' }),
        remove() {}
      };
    },
    querySelector(selector) {
      if (selector === '.swarmcast-viewer') return null;
      if (selector === '.swarmcast-outputs') return outputs;
      if (String(selector).includes('swarmcast-status')) return status;
      return null;
    }
  };
}

function readyJoin() {
  return {
    publicationId: 'pub',
    state: 'ready',
    contact: 'alice',
    publication: {
      id: 'pub',
      callId: 'room-1',
      broadcaster: 'alice',
      inputs: [],
      outputs: [{ id: 'cam-1', label: 'You', inputs: ['cam-1'] }]
    }
  };
}

async function flush() {
  for (let step = 0; step < 8; step += 1) await Promise.resolve();
}

test('viewer waits for relay connectivity before sending a join request', async () => {
  installViewerDocument();
  const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
  const mod = harness();
  mod.isRelayConnected = false;
  const viewer = new SwarmcastViewer(mod.app, mod, {
    publicationId: 'pub',
    broadcaster: 'alice',
    callId: 'room-1'
  });
  viewer.render();
  await flush();
  assert.equal(mod.sent.length, 0);
  assert.equal(viewer.phase, 'waiting-relay');
  mod.isRelayConnected = true;
  mod.noteRelay = () => viewer.noteRelay();
  viewer.noteRelay();
  await flush();
  assert.equal(mod.sent.length, 1);
  assert.equal(mod.sent[0].request, 'video-call-swarmcast-join-request');
});

test('a join response timeout sends exactly one retry', async () => {
  jest.useFakeTimers();
  try {
    installViewerDocument();
    const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
    const mod = harness();
    mod.isRelayConnected = true;
    const viewer = new SwarmcastViewer(mod.app, mod, {
      publicationId: 'pub',
      broadcaster: 'alice',
      callId: 'room-1'
    });
    viewer.render();
    await flush();
    assert.equal(mod.sent.length, 1);
    jest.advanceTimersByTime(15000);
    await flush();
    assert.equal(mod.sent.length, 2);
    assert.equal(mod.sent[1].request, 'video-call-swarmcast-join-request');
    jest.advanceTimersByTime(15000);
    await flush();
    assert.equal(mod.sent.length, 2);
    assert.equal(viewer.phase, 'unavailable');
  } finally {
    jest.useRealTimers();
  }
});

test('a response to either join request creates one peer connection', async () => {
  jest.useFakeTimers();
  try {
    installViewerDocument();
    const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
    const first = harness();
    first.isRelayConnected = true;
    const early = new SwarmcastViewer(first.app, first, {
      publicationId: 'pub',
      broadcaster: 'alice',
      callId: 'room-1'
    });
    early.render();
    await flush();
    early.receiveJoin(readyJoin());
    early.receiveJoin(readyJoin());
    assert.equal(first.peerManager.createdCount, 1);

    const second = harness();
    second.isRelayConnected = true;
    const retried = new SwarmcastViewer(second.app, second, {
      publicationId: 'pub',
      broadcaster: 'alice',
      callId: 'room-1'
    });
    retried.render();
    await flush();
    jest.advanceTimersByTime(15000);
    await flush();
    assert.equal(second.sent.length, 2);
    retried.receiveJoin(readyJoin());
    retried.receiveJoin(readyJoin());
    assert.equal(second.peerManager.createdCount, 1);
    assert.equal(second.sent.filter((item) => item.request === 'video-call-swarmcast-subscribe').length, 0);
    retried.onChannel('alice');
    retried.onChannel('alice');
    assert.equal(second.sent.filter((item) => item.request === 'video-call-swarmcast-subscribe').length, 1);
  } finally {
    jest.useRealTimers();
  }
});

test('cleanup invalidates a pending join retry', async () => {
  jest.useFakeTimers();
  try {
    installViewerDocument();
    const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
    const mod = harness();
    mod.isRelayConnected = true;
    const viewer = new SwarmcastViewer(mod.app, mod, {
      publicationId: 'pub',
      broadcaster: 'alice',
      callId: 'room-1'
    });
    viewer.render();
    await flush();
    viewer.interrupt();
    jest.advanceTimersByTime(20000);
    await flush();
    assert.equal(mod.sent.length, 1);
    viewer.receiveJoin(readyJoin());
    assert.equal(mod.peerManager.createdCount || 0, 0);
  } finally {
    jest.useRealTimers();
  }
});

test('a swarmcast join creates one answering peer connection and leaves the viewer out of the call', async () => {
  const mod = harness();
  mod.have_joined_room = 0;
  mod.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.sendCallJoinTransaction = () => {
    throw new Error('call join');
  };
  mod.sendCallEntryTransaction = () => {
    throw new Error('call entry');
  };
  const calls = [];
  mod.peerManager.createPeerConnection = (peerId, callback, answerOnly) => {
    calls.push({ peerId, callback, answerOnly });
    mod.peerManager.peers.set(peerId, { connectionState: 'new' });
  };
  await mod.answerBroadcastJoin('viewer', { publicationId: 'pub', callId: 'room-1' });
  await mod.answerBroadcastJoin('viewer', { publicationId: 'pub', callId: 'room-1' });
  assert.deepEqual(calls, [{ peerId: 'viewer', callback: false, answerOnly: true }]);
  assert.equal(mod.room_obj.call_peers.includes('viewer'), false);
  assert.equal(mod.have_joined_room, 0);
  const responses = mod.sent.filter((item) => item.request === 'video-call-swarmcast-join-response');
  assert.equal(responses.length, 2);
  assert.equal(responses[0].data.state, 'ready');
  assert.equal(responses[1].data.state, 'ready');

  const member = harness();
  member.app.BROWSER = 1;
  member.have_joined_room = Date.now();
  member.name = 'Videocall';
  member.processedTxs = {};
  member.db_tables = [];
  member.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  const callPeers = [];
  member.peerManager.createPeerConnection = (peerId, callback, answerOnly) => {
    callPeers.push({ peerId, callback, answerOnly });
  };
  await member.handlePeerTransaction(member.app, {
    isTo: () => true,
    isFrom: () => false,
    from: [{ publicKey: 'carol' }],
    timestamp: Date.now(),
    signature: 'sig-carol',
    returnMessage: () => ({ module: 'Videocall', request: 'peer-joined', call_id: 'room-1' })
  });
  assert.deepEqual(callPeers, [{ peerId: 'carol', callback: false, answerOnly: undefined }]);
  assert.equal(member.room_obj.call_peers.includes('carol'), true);
});

test('the viewer subscribes only after the peer manager reports the channel open', () => {
  const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
  const mod = harness();
  mod.peerManager.hasConnectionWithPeer = (peerId) => {
    const pc = mod.peerManager.peers.get(peerId);
    return pc?.connectionState === 'connected' && pc.dc?.readyState === 'open';
  };
  const viewer = new SwarmcastViewer(mod.app, mod, {
    publicationId: 'pub',
    broadcaster: 'alice',
    callId: 'room-1'
  });
  viewer.contact = 'alice';
  viewer.publication = { outputs: [{ id: 'cam-1' }] };
  viewer.sendSubscribe();
  assert.equal(mod.sent.some((item) => item.request === 'video-call-swarmcast-subscribe'), false);

  mod.peerManager.peers.set('alice', {
    connectionState: 'connected',
    dc: { readyState: 'open' }
  });
  viewer.sendSubscribe();
  const subscribe = mod.sent.find((item) => item.request === 'video-call-swarmcast-subscribe');
  assert.equal(subscribe.to, 'alice');
  assert.deepEqual(subscribe.data.outputIds, ['cam-1']);
});

function connectionGate(mod) {
  mod.peerManager.hasConnectionWithPeer = (peerId) => {
    const pc = mod.peerManager.peers.get(peerId);
    return pc?.connectionState === 'connected' && pc.dc?.readyState === 'open';
  };
}

function subscribeMessages(mod) {
  return mod.sent.filter((item) => item.request === 'video-call-swarmcast-subscribe');
}

function armedViewer(mod, outputs) {
  installViewerDocument();
  const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
  mod.isRelayConnected = false;
  const viewer = new SwarmcastViewer(mod.app, mod, {
    publicationId: 'pub',
    broadcaster: 'alice',
    callId: 'room-1'
  });
  viewer.render();
  viewer.contact = 'alice';
  viewer.publication = { id: 'pub', callId: 'room-1', outputs };
  return viewer;
}

test('a data channel that opens first waits for the peer connection', () => {
  const mod = harness();
  connectionGate(mod);
  const viewer = armedViewer(mod, [
    { id: 'cam-1', inputs: ['cam-1'] },
    { id: 'cam-2', inputs: ['cam-2'] }
  ]);
  mod.peerManager.peers.set('alice', { connectionState: 'connecting', dc: { readyState: 'open' } });
  mod.app.connection.emit('stun-data-channel-open', 'alice');
  assert.equal(subscribeMessages(mod).length, 0);

  mod.peerManager.peers.set('alice', { connectionState: 'connected', dc: { readyState: 'open' } });
  mod.app.connection.emit('stun-connection-connected', 'alice');
  assert.equal(subscribeMessages(mod).length, 1);
  assert.deepEqual(subscribeMessages(mod)[0].data, {
    publicationId: 'pub',
    callId: 'room-1',
    outputIds: ['cam-1', 'cam-2']
  });
  viewer.destroy();
});

test('a peer connection that connects first waits for the data channel', () => {
  const mod = harness();
  connectionGate(mod);
  const viewer = armedViewer(mod, [{ id: 'cam-1', inputs: ['cam-1'] }]);
  mod.peerManager.peers.set('alice', { connectionState: 'connected', dc: { readyState: 'connecting' } });
  mod.app.connection.emit('stun-connection-connected', 'alice');
  assert.equal(subscribeMessages(mod).length, 0);

  mod.peerManager.peers.get('alice').dc.readyState = 'open';
  mod.app.connection.emit('stun-data-channel-open', 'alice');
  assert.equal(subscribeMessages(mod).length, 1);
  assert.deepEqual(subscribeMessages(mod)[0].data.outputIds, ['cam-1']);
  viewer.destroy();
});

test('repeated readiness events send one subscribe for the same publication', () => {
  const mod = harness();
  connectionGate(mod);
  const viewer = armedViewer(mod, [{ id: 'cam-1', inputs: ['cam-1'] }]);
  mod.peerManager.peers.set('alice', { connectionState: 'connected', dc: { readyState: 'open' } });
  mod.app.connection.emit('stun-data-channel-open', 'alice');
  mod.app.connection.emit('stun-data-channel-open', 'alice');
  mod.app.connection.emit('stun-connection-connected', 'alice');
  mod.app.connection.emit('stun-connection-connected', 'alice');
  assert.equal(subscribeMessages(mod).length, 1);
  viewer.destroy();
});

test('two camera outputs are both attached when the subscribe arrives', () => {
  const mod = harness();
  connectionGate(mod);
  const outputs = [
    { id: 'cam-1', inputs: ['cam-1'] },
    { id: 'cam-2', inputs: ['cam-2'] }
  ];
  const viewer = armedViewer(mod, outputs);
  mod.peerManager.peers.set('alice', { connectionState: 'connecting', dc: { readyState: 'open' } });
  mod.app.connection.emit('stun-data-channel-open', 'alice');
  mod.peerManager.peers.set('alice', { connectionState: 'connected', dc: { readyState: 'open' } });
  mod.app.connection.emit('stun-connection-connected', 'alice');
  const message = subscribeMessages(mod)[0];
  assert.deepEqual(message.data.outputIds, ['cam-1', 'cam-2']);

  const broadcaster = harness();
  broadcaster.swarmcast = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  broadcaster.swarmcast.addCamera({ registryId: 'registry-alice', participant: 'alice', label: 'Alice' });
  broadcaster.swarmcast.addCamera({ registryId: 'registry-bob', participant: 'bob', label: 'Bob' });
  broadcaster.streams.entries.set('registry-alice', {
    mediaStream: new FakeStream([track('video', 'a-v'), track('audio', 'a-a')])
  });
  broadcaster.streams.entries.set('registry-bob', {
    mediaStream: new FakeStream([track('video', 'b-v'), track('audio', 'b-a')])
  });
  const pc = peerConnection();
  broadcaster.peerManager.peers.set('viewer', pc);
  new Swarmcasts(broadcaster).acceptBroadcastSubscribe('viewer', message.data);
  assert.deepEqual(
    pc.added.map((item) => item.id),
    ['a-v', 'a-a', 'b-v', 'b-a']
  );
  viewer.destroy();
});

test('a closed connection does not send a subscribe when it later connects', () => {
  const mod = harness();
  connectionGate(mod);
  const viewer = armedViewer(mod, [{ id: 'cam-1', inputs: ['cam-1'] }]);
  mod.peerManager.peers.set('alice', { connectionState: 'connecting', dc: { readyState: 'open' } });
  mod.app.connection.emit('stun-data-channel-open', 'alice');
  assert.equal(subscribeMessages(mod).length, 0);

  viewer.onChannelClose('alice');
  assert.equal(viewer.closed, true);
  assert.deepEqual(mod.peerManager.removed, ['alice']);

  mod.peerManager.peers.set('alice', { connectionState: 'connected', dc: { readyState: 'open' } });
  mod.app.connection.emit('stun-connection-connected', 'alice');
  viewer.sendSubscribe();
  assert.equal(subscribeMessages(mod).length, 0);
});

function placeCameras(mod) {
  const alice = camera('registry-alice', 'alice', 'local', new FakeStream([track('video', 'a-v'), track('audio', 'a-a')]));
  const bob = camera('registry-bob', 'bob', 'remote', new FakeStream([track('video', 'b-v'), track('audio', 'b-a')]));
  mod.streams.entries.set(alice.id, alice);
  mod.streams.entries.set(bob.id, bob);
  return { alice, bob };
}

function quietLink() {
  global.siteMessage = () => {};
  global.navigator = { clipboard: { writeText: async () => {} } };
}

function participantIds(mod) {
  return mod.swarmcast.outputs.map((output) => mod.swarmcast.inputs.find((input) => input.id === output.inputs[0])?.participant);
}

test('opening the configuration overlay does not start Swarmcast', () => {
  quietLink();
  const mod = harness();
  placeCameras(mod);
  let opened = 0;
  mod.swarmcasts.showSetup = () => {
    opened += 1;
  };
  const broadcast = mod.respondTo('call-actions').find((item) => item.hook === 'swarmcast onair');
  broadcast.callback();
  assert.equal(opened, 1);
  assert.equal(mod.swarmcast, undefined);

  const VideoCallPopup = require('../../../mods/videocall/lib/ui/videocall-popup');
  const popup = Object.create(VideoCallPopup.prototype);
  popup.mod = mod;
  const swarm = { onclick: null };
  const control = () => ({
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector() {
      return { classList: { toggle() {}, add() {}, remove() {} } };
    },
    onclick: null
  });
  popup.bindControls({
    querySelector(selector) {
      return selector === '.swarmcast-control' ? swarm : control();
    }
  });
  swarm.onclick();
  assert.equal(opened, 2);
  assert.equal(mod.swarmcast, undefined);
  const template = require('../../../mods/videocall/lib/ui/videocall-popup.template');
  assert.equal(template(true, true).includes('swarmcast-control'), true);
});

test('swarmcast settings starts screen capture or selected participants', async () => {
  quietLink();
  const html = require('../../../mods/videocall/lib/ui/overlays/swarmcast-setup.template')([
    { key: 'alice', name: 'You' },
    { key: 'bob', name: 'Bob' }
  ]);
  assert.equal(html.includes('saito-overlay-form'), true);
  assert.equal(html.includes('Swarmcast Settings'), true);
  assert.equal(html.includes('What do you want to Swarmcast?'), true);
  assert.equal(html.includes('value="interface" checked'), true);
  assert.equal(html.includes('My Screen'), true);
  assert.equal(html.includes('Video Boxes'), true);
  assert.equal(html.includes('Include Audio Tracks?'), true);
  assert.equal(html.includes('value="standard" checked'), true);
  assert.equal(html.includes('name="swarmcast-audio-member" value="alice" checked'), true);
  assert.equal(html.includes('name="swarmcast-video-member" value="bob"'), true);
  assert.equal(html.includes('name="swarmcast-video-member" value="bob" checked'), false);
  assert.equal(html.includes('My screen'), false);
  assert.equal(html.includes('All audio tracks'), false);
  assert.equal(html.includes('swarmcast-setup-cancel'), false);
  assert.equal(html.includes('<select'), false);

  const mod = harness();
  placeCameras(mod);
  const Setup = require('../../../mods/videocall/lib/ui/overlays/swarmcast-setup');
  const setup = new Setup(mod.app, mod);
  let closed = 0;
  setup.overlay.close = () => {
    closed += 1;
  };
  const root = settingsForm({ video: 'interface', audio: 'all' });
  assert.deepEqual(setup.configFrom(root), {
    video: { mode: 'interface', participants: [] },
    audio: { mode: 'everyone', participants: [] },
    quality: { preset: 'standard', maxWidth: 960, maxHeight: 540, maxFramerate: 15 }
  });
  const captured = new FakeStream([track('video', 'surface')]);
  global.navigator.mediaDevices = {
    getDisplayMedia: async () => captured
  };
  mod.streams.register = (fields) => {
    const entry = { id: 'surface-1', ...fields };
    mod.streams.entries.set(entry.id, entry);
    return entry;
  };
  mod.streams.remove = (id) => mod.streams.entries.delete(id);
  assert.equal(await setup.confirm(root), true);
  assert.equal(mod.swarmcast.document().show, 'interface');
  assert.deepEqual(audioParticipants(mod), ['alice', 'bob']);
  assert.equal(videoParticipants(mod).length, 0);
  assert.equal(root.dataset.state, 'live');
  assert.equal(closed, 0);
  mod.stopBroadcast();

  const chosen = settingsForm({
    video: 'participants',
    audio: 'participants',
    videoChecked: ['alice'],
    audioChecked: ['bob']
  });
  setup.sync(chosen);
  assert.equal(chosen.dataset.video, 'participants');
  assert.equal(chosen.dataset.audio, 'participants');
  chosen.videoMember.checked = true;
  chosen.inputs.find((input) => input.name === 'swarmcast-video' && input.value === 'interface').checked = true;
  chosen.inputs.find((input) => input.name === 'swarmcast-video' && input.value === 'participants').checked = false;
  setup.sync(chosen);
  assert.equal(chosen.dataset.video, 'interface');
  assert.equal(chosen.videoMember.checked, true);
  chosen.inputs.find((input) => input.name === 'swarmcast-video' && input.value === 'interface').checked = false;
  chosen.inputs.find((input) => input.name === 'swarmcast-video' && input.value === 'participants').checked = true;
  assert.equal(await setup.confirm(chosen), true);
  assert.equal(mod.swarmcast.document().show, 'participants');
  assert.deepEqual(videoParticipants(mod), ['alice']);
  assert.deepEqual(audioParticipants(mod), ['bob']);
  assert.equal(chosen.dataset.state, 'live');
  assert.equal(closed, 0);
  mod.stopBroadcast();
});

function settingsForm({ video, audio, videoChecked = [], audioChecked = [] }) {
  const inputs = [
    { name: 'swarmcast-video', value: 'interface', type: 'radio', checked: video !== 'participants' },
    { name: 'swarmcast-video', value: 'participants', type: 'radio', checked: video === 'participants' },
    { name: 'swarmcast-audio', value: 'all', type: 'radio', checked: audio !== 'participants' },
    { name: 'swarmcast-audio', value: 'participants', type: 'radio', checked: audio === 'participants' },
    { name: 'swarmcast-video-member', value: 'alice', type: 'checkbox', checked: videoChecked.includes('alice') },
    { name: 'swarmcast-video-member', value: 'bob', type: 'checkbox', checked: videoChecked.includes('bob') },
    { name: 'swarmcast-audio-member', value: 'alice', type: 'checkbox', checked: audioChecked.includes('alice') },
    { name: 'swarmcast-audio-member', value: 'bob', type: 'checkbox', checked: audioChecked.includes('bob') }
  ];
  const root = {
    dataset: {},
    inputs,
    videoMember: inputs.find((input) => input.name === 'swarmcast-video-member' && input.value === 'alice'),
    querySelector(selector) {
      const name = /name="([^"]+)"/.exec(selector)?.[1];
      if (!name || !selector.includes(':checked')) return null;
      return inputs.find((input) => input.name === name && input.checked) || null;
    },
    querySelectorAll(selector) {
      if (selector === 'input') return inputs;
      const name = /name="([^"]+)"/.exec(selector)?.[1];
      if (!name) return [];
      return inputs.filter((input) => input.name === name && (!selector.includes(':checked') || input.checked));
    }
  };
  return root;
}

function videoParticipants(mod) {
  return mod.swarmcast.outputs.filter((output) => output.role === 'video' && output.kind === 'camera').map((output) => output.participant);
}

function audioParticipants(mod) {
  return mod.swarmcast.outputs.filter((output) => output.role === 'audio').map((output) => output.participant);
}

function transmit(mod) {
  const pc = peerConnection();
  mod.peerManager.peers.set('viewer', pc);
  mod.acceptBroadcastSubscribe('viewer', { publicationId: mod.swarmcast.id, outputIds: mod.swarmcast.outputs.map((output) => output.id) });
  return pc.added.map((item) => item.id);
}

test('video and audio selections are published independently', async () => {
  quietLink();
  const mod = harness();
  placeCameras(mod);
  assert.equal(await mod.startBroadcast({
    video: { mode: 'me' },
    includeAllAudio: true
  }), true);
  assert.deepEqual(videoParticipants(mod), ['alice']);
  assert.deepEqual(audioParticipants(mod), ['alice', 'bob']);
  assert.deepEqual(transmit(mod), ['a-v', 'a-a', 'b-a']);
  const carol = camera('registry-carol', 'carol', 'remote', new FakeStream([track('video', 'c-v'), track('audio', 'c-a')]));
  mod.streams.entries.set(carol.id, carol);
  mod.app.connection.emit('videocall-stream-added', carol);
  assert.deepEqual(videoParticipants(mod), ['alice']);
  assert.deepEqual(audioParticipants(mod), ['alice', 'bob', 'carol']);
  mod.streams.entries.delete(carol.id);
  mod.stopBroadcast();

  assert.equal(await mod.startBroadcast({
    video: { mode: 'me' },
    audio: { mode: 'me' }
  }), true);
  assert.deepEqual(videoParticipants(mod), ['alice']);
  assert.deepEqual(audioParticipants(mod), ['alice']);
  mod.stopBroadcast();

  assert.equal(await mod.startBroadcast({
    video: { mode: 'one', participant: 'bob' },
    includeAllAudio: true
  }), true);
  assert.deepEqual(videoParticipants(mod), ['bob']);
  assert.deepEqual(audioParticipants(mod), ['alice', 'bob']);
  mod.stopBroadcast();

  assert.equal(await mod.startBroadcast({
    video: { mode: 'everyone' },
    audio: { mode: 'none' }
  }), true);
  assert.deepEqual(videoParticipants(mod), ['alice', 'bob']);
  assert.deepEqual(audioParticipants(mod), []);
  assert.deepEqual(transmit(mod), ['a-v', 'b-v']);
  mod.stopBroadcast();

  assert.equal(await mod.startBroadcast({
    video: { mode: 'subset', participants: ['alice'] },
    audio: { mode: 'subset', participants: ['bob'] }
  }), true);
  assert.deepEqual(videoParticipants(mod), ['alice']);
  assert.deepEqual(audioParticipants(mod), ['bob']);
  mod.streams.entries.set(carol.id, carol);
  mod.app.connection.emit('videocall-stream-added', carol);
  assert.deepEqual(videoParticipants(mod), ['alice']);
  assert.deepEqual(audioParticipants(mod), ['bob']);
  mod.app.connection.emit('videocall-stream-removed', mod.streams.entries.get('registry-bob'));
  assert.deepEqual(audioParticipants(mod), []);
  assert.deepEqual(videoParticipants(mod), ['alice']);
  mod.stopBroadcast();
  assert.equal(mod.swarmcast, null);
});

test('disabling a camera keeps the video output and its audio', async () => {
  quietLink();
  const mod = harness();
  placeCameras(mod);
  await mod.startBroadcast({ video: { mode: 'everyone' }, audio: { mode: 'everyone' } });
  mod.app.connection.emit('videocall-peer-video-changed', { enabled: false, public_key: 'bob' });
  const video = mod.swarmcast.outputs.find((output) => output.role === 'video' && output.participant === 'bob');
  const audio = mod.swarmcast.outputs.find((output) => output.role === 'audio' && output.participant === 'bob');
  assert.equal(video.camera, 'disabled');
  assert.equal(audio.participant, 'bob');
  assert.equal(mod.swarmcast.document().show, 'participants');
  mod.app.connection.emit('videocall-peer-audio-changed', { enabled: false, public_key: 'bob' });
  assert.equal(audio.muted, true);
  assert.equal(mod.swarmcast.outputs.some((output) => output.participant === 'bob'), true);
});

test('the captured call interface is one video output and selected audio stays separate', async () => {
  quietLink();
  const mod = harness();
  placeCameras(mod);
  const captured = new FakeStream([track('video', 'surface'), track('audio', 'surface-audio')]);
  let restrictions = 0;
  captured.getVideoTracks()[0].restrictTo = async () => {
    restrictions += 1;
  };
  const previousRestriction = global.RestrictionTarget;
  global.RestrictionTarget = { fromElement: async () => ({}) };
  captured.removeTrack = (item) => {
    captured.tracks = captured.tracks.filter((track) => track !== item);
  };
  global.navigator = {
    clipboard: { writeText: async () => {} },
    mediaDevices: {
      getDisplayMedia: async (constraints) => {
        assert.equal(constraints.audio, false);
        assert.equal(constraints.preferCurrentTab, true);
        return captured;
      }
    }
  };
  let registered = null;
  mod.streams.register = (fields) => {
    registered = { id: 'surface-1', ...fields };
    mod.streams.entries.set(registered.id, registered);
    return registered;
  };
  mod.streams.remove = (id) => {
    const entry = mod.streams.entries.get(id) || null;
    mod.streams.entries.delete(id);
    return entry;
  };
  assert.equal(await mod.startBroadcast({
    video: { mode: 'interface' },
    audio: { mode: 'me' }
  }), true);
  const doc = mod.swarmcast.document();
  assert.equal(doc.show, 'interface');
  assert.equal(doc.outputs.filter((output) => output.kind === 'interface').length, 1);
  assert.deepEqual(videoParticipants(mod), []);
  assert.deepEqual(audioParticipants(mod), ['alice']);
  assert.equal(captured.getTracks().some((item) => item.kind === 'audio'), false);
  assert.equal(restrictions, 0);
  assert.equal(registered.mediaStream.getVideoTracks()[0].id, 'surface');
  assert.deepEqual(transmit(mod), ['surface', 'a-a']);
  mod.stopBroadcast();
  assert.equal(mod.streams.entries.has('surface-1'), false);
  assert.equal(registered.mediaStream, captured);
  if (previousRestriction === undefined) delete global.RestrictionTarget;
  else global.RestrictionTarget = previousRestriction;
});

test('the subscriber renders participant videos separately from a captured interface', () => {
  installViewerDocument();
  const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
  const app = { connection: { on() {}, removeListener() {} }, keychain: { returnIdentifierByPublicKey: (key) => key } };
  const viewer = new SwarmcastViewer(app, { publicKey: 'viewer' }, {
    publicationId: 'pub',
    broadcaster: 'alice',
    callId: 'room-1'
  });
  const ids = new Map();
  const boxFor = (id) => {
    const video = { srcObject: null, addEventListener() {}, play: () => Promise.resolve() };
    const mask = { classList: { add() {}, remove() {} } };
    const icon = { classList: { add() {}, remove() {} } };
    const box = {
      id,
      className: 'videobox',
      dataset: {},
      classList: { add() {}, remove() {} },
      appendChild() {},
      remove() {},
      querySelector(selector) {
        if (selector === 'video' || String(selector).endsWith(' video')) return video;
        if (String(selector).includes('default-video-mask')) return mask;
        if (String(selector).includes('audio-indicator')) return icon;
        return { textContent: '', classList: { add() {}, remove() {} }, hidden: false };
      }
    };
    ids.set(id, box);
    return box;
  };
  global.document.getElementById = (id) => ids.get(id) || null;
  const previousQuery = global.document.querySelector;
  global.document.querySelector = (selector) => {
    if (String(selector).startsWith('#stream_')) {
      const id = String(selector).split(' ')[0].slice(1);
      const box = ids.get(id);
      if (!box) return null;
      if (String(selector).includes(' ')) return box.querySelector(selector);
      return box;
    }
    return previousQuery(selector);
  };
  app.browser = {
    addElementToDom(html, parent) {
      const id = /id="([^"]+)"/.exec(html)[1];
      parent.appendChild(boxFor(id));
    },
    addElementToClass() {}
  };
  viewer.applyPublication({
    show: 'participants',
    outputs: [
      { id: 'cam-1', role: 'video', kind: 'camera', participant: 'alice', label: 'Alice', camera: 'live' },
      { id: 'cam-2', role: 'video', kind: 'camera', participant: 'bob', label: 'Bob', camera: 'disabled' },
      { id: 'aud-1', role: 'audio', kind: 'audio', participant: 'carol', label: 'Carol', muted: false }
    ]
  });
  assert.equal(viewer.tiles.size, 2);
  assert.equal(viewer.audio.size, 1);
  assert.equal(ids.get('stream_alice').className, 'videobox');
  assert.equal(ids.get('stream_bob').className, 'videobox');

  viewer.applyPublication({
    show: 'interface',
    outputs: [{ id: 'interface', role: 'video', kind: 'interface', label: 'Video call' }]
  });
  assert.equal(viewer.elements.size, 1);
  assert.equal(viewer.elements.get('interface').className, 'swarmcast-interface');
  assert.equal(viewer.elements.get('interface').className.includes('videobox'), false);
});

test('individual forwarding does not compose, and capture is capped without a frame loop', async () => {
  quietLink();
  const mod = harness();
  placeCameras(mod);
  const calls = { display: 0, timers: 0, frames: 0 };
  const previousInterval = global.setInterval;
  const previousFrame = global.requestAnimationFrame;
  global.setInterval = () => {
    calls.timers += 1;
    return 1;
  };
  global.requestAnimationFrame = () => {
    calls.frames += 1;
    return 1;
  };
  global.navigator = {
    clipboard: { writeText: async () => {} },
    mediaDevices: { getDisplayMedia: async () => { calls.display += 1; return new FakeStream(); } }
  };
  assert.equal(await mod.startBroadcast({ video: { mode: 'me' }, audio: { mode: 'me' } }), true);
  assert.equal(calls.display, 0);
  assert.equal(mod.swarmcastProfile.mode, 'forward');
  assert.equal(mod.swarmcastProfile.composer, false);
  assert.equal(mod.swarmcastProfile.frameLoop, false);
  assert.equal(mod.swarmcastComposer, undefined);
  mod.stopBroadcast();

  const surface = track('video', 'surface');
  surface.getSettings = () => ({ width: 1280, height: 720, frameRate: 15 });
  surface.applyConstraints = async (constraints) => {
    calls.applied = constraints;
  };
  const captured = new FakeStream([surface, track('audio', 'tab-audio')]);
  captured.removeTrack = (item) => {
    captured.tracks = captured.tracks.filter((track) => track !== item);
  };
  let requested = null;
  global.navigator.mediaDevices.getDisplayMedia = async (constraints) => {
    requested = constraints;
    return captured;
  };
  mod.swarmcastLimits = {
    interface: { maxWidth: 960, maxHeight: 540, maxFramerate: 12, maxBitrate: 700000 }
  };
  mod.streams.register = (fields) => {
    const entry = { id: 'surface-1', ...fields };
    mod.streams.entries.set(entry.id, entry);
    return entry;
  };
  mod.streams.remove = (id) => {
    const entry = mod.streams.entries.get(id) || null;
    mod.streams.entries.delete(id);
    if (entry?.disposition === 'owned') entry.mediaStream?.getTracks?.().forEach((item) => item.stop());
    return entry;
  };
  const cameraTrack = mod.streams.entries.get('registry-alice').mediaStream.getVideoTracks()[0];
  assert.equal(await mod.startBroadcast({ video: { mode: 'interface' }, audio: { mode: 'me' } }), true);
  assert.equal(requested.audio, false);
  assert.equal(requested.video.frameRate.max, 12);
  assert.equal(requested.video.width.max, 960);
  assert.deepEqual(calls.applied.frameRate, { ideal: 12, max: 12 });
  assert.equal(calls.timers, 0);
  assert.equal(calls.frames, 0);
  assert.equal(mod.swarmcastFrameLoop, null);
  assert.equal(mod.swarmcastProfile.mode, 'capture');
  assert.equal(mod.swarmcastProfile.capture.frameRate, 15);
  const pc = peerConnection();
  pc.addTrack = (media) => {
    const sender = {
      track: media,
      replaced: 0,
      parameters: null,
      getParameters: () => ({ encodings: [{}] }),
      setParameters(params) {
        this.parameters = params;
        return Promise.resolve();
      },
      replaceTrack(next) {
        this.replaced += 1;
        this.track = next;
        return Promise.resolve();
      }
    };
    const transceiver = { sender, mid: String(pc.transceivers.length), direction: 'sendonly', currentDirection: 'sendonly' };
    pc.transceivers.push(transceiver);
    pc.added.push(media);
    return sender;
  };
  pc.onnegotiationneeded = () => {
    pc.offers = (pc.offers || 0) + 1;
  };
  mod.peerManager.peers.set('viewer', pc);
  mod.acceptBroadcastSubscribe('viewer', { publicationId: mod.swarmcast.id, outputIds: ['interface', 'aud-1'] });
  await Promise.resolve();
  const videoSender = mod.swarmcast.childFor('viewer').media_streams.find((item) => item.kind === 'video').sender;
  const audioSender = mod.swarmcast.childFor('viewer').media_streams.find((item) => item.kind === 'audio').sender;
  assert.equal(videoSender.parameters.encodings[0].maxFramerate, 12);
  assert.equal(videoSender.parameters.encodings[0].maxBitrate, 700000);
  assert.equal(audioSender.parameters.encodings[0].maxBitrate, 40000);
  assert.equal(audioSender.parameters.encodings[0].maxFramerate, undefined);
  assert.equal(pc.offers || 0, 0);

  mod.app.connection.emit('videocall-peer-audio-changed', { enabled: false, public_key: 'alice' });
  await Promise.resolve();
  assert.equal(videoSender.replaced, 0);
  assert.equal(videoSender.track, surface);
  assert.equal(audioSender.track.id, 'a-a');

  mod.stopBroadcast();
  assert.equal(surface.stopped, true);
  assert.equal(cameraTrack.stopped, undefined);
  assert.equal(mod.swarmcastFrameLoop, null);
  global.setInterval = previousInterval;
  global.requestAnimationFrame = previousFrame;
});

test('capture constraint rejection keeps the track and sender limits wait for a send direction', async () => {
  const { settleSenders, compareCounters } = require('../../../mods/videocall/lib/swarmcast');
  assert.deepEqual(compareCounters(
    { bytesSent: 0, framesEncoded: 0 },
    { bytesSent: 1200, framesEncoded: 4 }
  ).bytesSent, 1200);
  assert.equal(compareCounters({ bytesSent: 'unavailable' }, { bytesSent: 1 }).bytesSent, 'unavailable');

  quietLink();
  const mod = harness();
  placeCameras(mod);
  const surface = track('video', 'surface');
  surface.getSettings = () => ({ width: 800, height: 450, frameRate: 8 });
  surface.applyConstraints = async () => {
    throw Object.assign(new Error('overconstrained'), { name: 'OverconstrainedError' });
  };
  const captured = new FakeStream([surface]);
  global.navigator.mediaDevices = { getDisplayMedia: async () => captured };
  mod.streams.register = (fields) => {
    const entry = { id: 'surface-1', ...fields };
    mod.streams.entries.set(entry.id, entry);
    return entry;
  };
  mod.streams.remove = (id) => mod.streams.entries.delete(id);
  assert.equal(await mod.startBroadcast({ video: { mode: 'interface' }, audio: { mode: 'none' } }), true);
  assert.equal(surface.stopped, undefined);
  assert.equal(mod.swarmcastCaptureSettings.frameRate, 8);

  mod.stopBroadcast();
});

test('video transmission waits until the negotiated direction permits sending', async () => {
  const { settleSenders } = require('../../../mods/videocall/lib/swarmcast');
  const limits = { camera: {}, interface: { maxFramerate: 15, maxBitrate: 1000, maxWidth: 1280 }, audio: {} };
  const finish = async (current, desired, answer) => {
    quietLink();
    const mod = harness();
    placeCameras(mod);
    const surface = track('video', 'surface');
    surface.getSettings = () => ({ width: 640, height: 360, frameRate: 10 });
    global.navigator.mediaDevices = { getDisplayMedia: async () => new FakeStream([surface]) };
    mod.streams.register = (fields) => {
      const entry = { id: 'surface-1', ...fields };
      mod.streams.entries.set(entry.id, entry);
      return entry;
    };
    mod.streams.remove = (id) => mod.streams.entries.delete(id);
    assert.equal(await mod.startBroadcast({ video: { mode: 'interface' }, audio: { mode: 'none' } }), true);
    const pc = peerConnection();
    const offers = [];
    pc.onnegotiationneeded = () => {
      if (pc.signalingState !== 'stable') {
        pc.negotiateAgain = true;
        return;
      }
      pc.signalingState = 'have-local-offer';
      offers.push({ type: 'offer', direction: pc.transceivers[0].direction });
      mod.app.connection.emit('stun-signaling-state', 'viewer', pc.signalingState);
    };
    pc.addTrack = (media) => {
      const sender = {
        track: media,
        parameters: null,
        attempts: 0,
        getParameters: () => ({ encodings: [{ active: true }] }),
        setParameters(params) {
          this.attempts += 1;
          if (answer === 'reject-parameters') {
            return Promise.reject(Object.assign(new Error('busy'), { name: 'InvalidStateError' }));
          }
          this.parameters = params;
          return Promise.resolve();
        }
      };
      const transceiver = { sender, mid: '1', currentDirection: current };
      let direction = desired;
      Object.defineProperty(transceiver, 'direction', {
        configurable: true,
        get: () => direction,
        set(value) {
          direction = value;
          pc.onnegotiationneeded();
        }
      });
      pc.transceivers.push(transceiver);
      pc.added.push(media);
      return sender;
    };
    mod.peerManager.peers.set('viewer', pc);
    pc.signalingState = 'stable';
    mod.acceptBroadcastSubscribe('viewer', { publicationId: mod.swarmcast.id, outputIds: ['interface'] });
    await Promise.resolve();
    await Promise.resolve();
    mod.app.connection.emit('stun-signaling-state', 'viewer', 'stable');
    await Promise.resolve();
    await Promise.resolve();
    const viewer = mod.swarmcast.childFor('viewer');
    const sender = viewer.media_streams.find((item) => item.kind === 'video').sender;
    return { mod, pc, offers, sender, viewer, limits };
  };

  const ready = await finish('sendonly', 'sendonly', 'keep');
  assert.equal(ready.offers.length, 0);
  assert.equal(ready.pc.transceivers[0].direction, 'sendonly');
  assert.equal(ready.sender.parameters.encodings[0].maxFramerate, 10);
  ready.mod.stopBroadcast();

  const both = await finish('sendrecv', 'sendrecv', 'keep');
  assert.equal(both.offers.length, 0);
  assert.equal(both.sender.parameters.encodings[0].maxBitrate, 800000);
  both.mod.stopBroadcast();

  const unknown = await finish(null, 'sendrecv', 'keep');
  assert.equal(unknown.offers.length, 0);
  assert.equal(unknown.pc.transceivers[0].direction, 'sendrecv');
  assert.equal(unknown.sender.parameters, null);
  unknown.mod.stopBroadcast();

  const corrected = await finish('inactive', 'recvonly', 'answer');
  assert.equal(corrected.offers.length, 1);
  assert.equal(corrected.offers[0].direction, 'sendrecv');
  assert.equal(corrected.pc.signalingState, 'have-local-offer');
  assert.equal(corrected.sender.parameters, null);
  corrected.pc.transceivers[0].currentDirection = 'sendonly';
  corrected.pc.signalingState = 'stable';
  corrected.mod.app.connection.emit('stun-signaling-state', 'viewer', 'stable');
  await Promise.resolve();
  assert.equal(corrected.sender.parameters.encodings[0].maxFramerate, 10);
  assert.equal(corrected.viewer.media_streams[0].sendNegotiation, 'ready');
  corrected.mod.stopBroadcast();

  const failed = await finish('recvonly', 'recvonly', 'fail');
  assert.equal(failed.offers.length, 1);
  assert.equal(failed.sender.parameters, null);
  failed.pc.signalingState = 'stable';
  failed.mod.app.connection.emit('stun-signaling-state', 'viewer', 'stable');
  await Promise.resolve();
  assert.equal(failed.sender.parameters, null);
  assert.equal(failed.viewer.media_streams[0].sendNegotiation, 'failed');
  assert.equal(failed.offers.length, 1);
  failed.mod.stopBroadcast();

  const rejected = await finish('sendrecv', 'sendrecv', 'reject-parameters');
  await Promise.resolve();
  assert.equal(rejected.sender.parameters, null);
  assert.equal(rejected.sender.attempts, 1);
  settleSenders(rejected.pc, rejected.viewer.media_streams, limits);
  await Promise.resolve();
  assert.equal(rejected.sender.attempts, 1);
  rejected.mod.stopBroadcast();
});

test('video sender parameters keep the negotiated encoding', async () => {
  quietLink();
  const mod = harness();
  placeCameras(mod);
  const surface = track('video', 'surface');
  surface.getSettings = () => ({ width: 640, height: 360, frameRate: 10 });
  global.navigator.mediaDevices = { getDisplayMedia: async () => new FakeStream([surface]) };
  mod.streams.register = (fields) => {
    const entry = { id: 'surface-1', ...fields };
    mod.streams.entries.set(entry.id, entry);
    return entry;
  };
  mod.streams.remove = (id) => mod.streams.entries.delete(id);
  assert.equal(await mod.startBroadcast({ video: { mode: 'interface' }, audio: { mode: 'none' } }), true);
  const pc = peerConnection();
  const encoding = { active: true, maxBitrate: 1 };
  let calls = 0;
  let reads = 0;
  pc.addTrack = (media) => {
    const sender = {
      track: media,
      parameters: null,
      getParameters: () => {
        reads += 1;
        return reads === 1 ? { encodings: [] } : { encodings: [encoding] };
      },
      setParameters(params) {
        calls += 1;
        this.parameters = params;
        return Promise.resolve();
      }
    };
    pc.transceivers.push({ sender, mid: '1', direction: 'sendonly', currentDirection: 'sendonly' });
    pc.added.push(media);
    return sender;
  };
  mod.peerManager.peers.set('viewer', pc);
  mod.acceptBroadcastSubscribe('viewer', { publicationId: mod.swarmcast.id, outputIds: ['interface'] });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(pc.added[0], surface);
  mod.app.connection.emit('stun-signaling-state', 'viewer', 'stable');
  await Promise.resolve();
  await Promise.resolve();
  const sender = mod.swarmcast.childFor('viewer').media_streams.find((item) => item.kind === 'video').sender;
  assert.equal(calls, 1);
  assert.equal(sender.parameters.encodings[0], encoding);
  assert.equal(encoding.maxFramerate, 10);
  assert.equal(encoding.active, true);
  mod.stopBroadcast();
});

test('rtp statistics select the interface report and keep zero separate from a missing report', () => {
  const { selectRtpReport, interpretMedia } = require('../../../mods/videocall/lib/swarmcast');
  const stats = new Map([
    ['audio', { type: 'outbound-rtp', kind: 'audio', mid: '2', ssrc: 9, bytesSent: 80, packetsSent: 4 }],
    ['camera', { type: 'outbound-rtp', kind: 'video', mid: '0', trackIdentifier: 'camera', ssrc: 1, bytesSent: 400, framesEncoded: 8, codecId: 'cam-codec' }],
    ['screen', { type: 'outbound-rtp', kind: 'video', mid: '1', trackIdentifier: 'surface', ssrc: 4, bytesSent: 0, framesEncoded: 0, packetsSent: 0, codecId: 'screen-codec' }],
    ['screen-codec', { type: 'codec', id: 'screen-codec', mimeType: 'video/VP8', payloadType: 96 }],
    ['other-video', { type: 'inbound-rtp', kind: 'video', mid: '3', ssrc: 8, bytesReceived: 900, framesDecoded: 20 }],
    ['screen-in', { type: 'inbound-rtp', mediaType: 'video', mid: '1', trackIdentifier: 'surface', ssrc: 4, bytesReceived: 0, packetsReceived: 0, framesDecoded: 0, codecId: 'screen-codec' }]
  ]);
  const outbound = selectRtpReport(stats, { type: 'outbound-rtp', kind: 'video', mid: '1', trackId: 'surface', scoped: false });
  assert.equal(outbound.matched, true);
  assert.equal(outbound.match, 'track');
  assert.equal(outbound.ssrc, 4);
  assert.equal(outbound.codec, 'video/VP8');
  assert.equal(outbound.bytesSent, 0);
  assert.equal(outbound.framesEncoded, 0);
  assert.notEqual(outbound.bytesSent, 400);
  const inbound = selectRtpReport(stats, { type: 'inbound-rtp', kind: 'video', mid: '1', trackId: 'surface', scoped: false });
  assert.equal(inbound.matched, true);
  assert.equal(inbound.bytesReceived, 0);
  assert.equal(inbound.framesDecoded, 0);
  assert.notEqual(inbound.bytesReceived, 900);
  const missing = selectRtpReport(stats, { type: 'outbound-rtp', kind: 'video', mid: '9', trackId: 'missing', scoped: false });
  assert.equal(missing.matched, false);
  assert.equal(missing.reason, 'no report correlated to this track');
  assert.equal(interpretMedia('outbound', outbound, outbound), 'no outbound frames encoded');
  assert.equal(interpretMedia('inbound', missing, missing), 'no report correlated to this track');
  const scoped = selectRtpReport(new Map([
    ['only', { type: 'outbound-rtp', mediaType: 'video', ssrc: 4, bytesSent: 1200, framesEncoded: 3 }]
  ]), { type: 'outbound-rtp', kind: 'video', mid: '1', trackId: 'surface', scoped: true });
  assert.equal(scoped.match, 'scoped');
  assert.equal(interpretMedia('outbound', { ...scoped, bytesSent: 0, framesEncoded: 0 }, scoped), 'frames transmitted');
});

test('inbound statistics are collected while video is waiting', async () => {
  const ui = entryDocument();
  const viewer = entryViewer(ui, []);
  let sample = 0;
  viewer.mod.peerManager.peers = new Map([['alice', {
    getStats: async () => {
      sample += 1;
      return new Map([['video', {
        type: 'inbound-rtp',
        kind: 'video',
        mid: '1',
        bytesReceived: sample === 1 ? 0 : 500,
        packetsReceived: sample,
        framesReceived: sample === 1 ? 0 : 2,
        framesDecoded: sample === 1 ? 0 : 2
      }]]);
    }
  }]]);
  viewer.contact = 'alice';
  viewer.applyPublication({
    show: 'interface',
    outputs: [{ id: 'interface', role: 'video', kind: 'interface', label: 'Video call' }]
  });
  const picture = track('video', 'surface');
  viewer.receiveTracks({
    publicationId: 'pub',
    outputs: [{ id: 'interface', mids: [{ mid: '1', kind: 'video' }] }]
  });
  viewer.onTrack('alice', { track: picture, transceiver: { mid: '1' } });
  const lines = [];
  const previous = console.info;
  console.info = (...args) => {
    if (args[0] === 'SWARMCAST PIPELINE TRACE') lines.push(args[1]);
  };
  const first = viewer.sampleInbound('interface', 'waiting');
  const second = viewer.sampleInbound('interface', 'waiting-followup');
  await first;
  await second;
  await new Promise((resolve) => setImmediate(resolve));
  console.info = previous;
  const parsed = lines.map((line) => JSON.parse(line));
  assert.equal(parsed.some((item) => item.stage === 'inbound' && item.bytesReceived === 0), true);
  assert.equal(parsed.some((item) => item.stage === 'summary' && item.reception === 'bytes received but no decoded frames' || item.reception === 'decoded frames but no rendered picture'), true);
  assert.equal(viewer.elements.get('interface').querySelector('video').plays, 0);
});

test('entering a swarmcast starts prepared video and audio once', async () => {
  const page = require('../../../mods/videocall/lib/ui/swarmcast.template')('connecting', '');
  assert.equal(page.includes('data-entry="connecting"'), true);
  assert.equal(page.includes('Enter Swarmcast'), true);
  assert.equal(page.includes('Enable audio'), false);
  const ui = entryDocument();
  const subscriptions = [];
  const viewer = entryViewer(ui, subscriptions);
  viewer.refreshEntry();
  assert.equal(ui.root.dataset.entry, 'connecting');
  assert.equal(stepDone(ui, 'Connecting to broadcaster'), false);
  assert.equal(ui.welcome.hidden, true);

  viewer.contact = 'alice';
  viewer.onConnected('alice');
  assert.equal(stepDone(ui, 'Connecting to broadcaster'), true);
  assert.equal(subscriptions.length, 0);
  viewer.applyPublication({
    show: 'participants',
    outputs: [
      { id: 'cam-1', role: 'video', kind: 'camera', participant: 'alice', label: 'Alice' },
      { id: 'cam-2', role: 'video', kind: 'camera', participant: 'bob', label: 'Bob' },
      { id: 'aud-1', role: 'audio', kind: 'audio', participant: 'alice', label: 'Alice' },
      { id: 'aud-2', role: 'audio', kind: 'audio', participant: 'bob', label: 'Bob' }
    ]
  });
  assert.equal(stepDone(ui, 'Connecting to Alice'), false);
  assert.equal(stepDone(ui, 'Connecting to Bob'), false);
  const before = subscriptions.length;
  viewer.receiveTracks({
    publicationId: 'pub',
    outputs: [
      { id: 'cam-1', mids: [{ mid: '0', kind: 'video' }] },
      { id: 'cam-2', mids: [{ mid: '1', kind: 'video' }] },
      { id: 'aud-1', mids: [{ mid: '2', kind: 'audio' }] },
      { id: 'aud-2', mids: [{ mid: '3', kind: 'audio' }] }
    ]
  });
  assert.equal(subscriptions.length, before + 1);
  viewer.onTrack('alice', { track: track('video', 'va'), transceiver: { mid: '0' } });
  viewer.onTrack('alice', { track: track('audio', 'aa'), transceiver: { mid: '2' } });
  assert.equal(ui.root.dataset.entry, 'ready');
  assert.equal(ui.welcome.hidden, false);
  assert.equal(ui.pending.textContent.includes('Bob is still connecting'), true);
  assert.equal(stepDone(ui, 'Subscribing to broadcast'), true);
  assert.equal(stepDone(ui, 'Receiving video and audio'), true);
  assert.equal(ui.stage.hidden, true);
  const videos = [...viewer.elements.values()].map((box) => box.querySelector('video'));
  assert.equal(videos.every((video) => video.plays === 0), true);

  viewer.onTrack('alice', { track: track('video', 'vb'), transceiver: { mid: '1' } });
  viewer.onTrack('alice', { track: track('audio', 'ab'), transceiver: { mid: '3' } });
  assert.equal(videos.every((video) => video.plays === 0), true);
  assert.equal([...viewer.audio.values()].every((item) => item.element.plays === 0), true);
  const sentBeforeEntry = subscriptions.length;
  ui.enter.onclick();
  await Promise.resolve();
  assert.equal(subscriptions.length, sentBeforeEntry);
  assert.equal(ui.root.dataset.entry, 'viewing');
  assert.equal(ui.stage.hidden, false);
  assert.equal(videos.every((video) => video.plays === 1 && video.muted && video.paused === false), true);
  assert.equal(viewer.audio.get('aud-1').element.plays, 1);
  assert.equal(viewer.audio.get('aud-2').element.plays, 1);
  ui.enter.onclick();
  assert.equal(videos[0].plays, 1);
  assert.equal(viewer.audio.get('aud-1').element.plays, 1);

  viewer.applyPublication({
    show: 'participants',
    outputs: [
      { id: 'cam-1', role: 'video', kind: 'camera', participant: 'alice', label: 'Alice' },
      { id: 'cam-2', role: 'video', kind: 'camera', participant: 'bob', label: 'Bob' },
      { id: 'aud-1', role: 'audio', kind: 'audio', participant: 'alice', label: 'Alice' },
      { id: 'aud-2', role: 'audio', kind: 'audio', participant: 'bob', label: 'Bob' },
      { id: 'aud-3', role: 'audio', kind: 'audio', participant: 'carol', label: 'Carol' }
    ]
  });
  viewer.receiveTracks({
    publicationId: 'pub',
    outputs: [
      { id: 'cam-1', mids: [{ mid: '0', kind: 'video' }] },
      { id: 'cam-2', mids: [{ mid: '1', kind: 'video' }] },
      { id: 'aud-1', mids: [{ mid: '2', kind: 'audio' }] },
      { id: 'aud-2', mids: [{ mid: '3', kind: 'audio' }] },
      { id: 'aud-3', mids: [{ mid: '5', kind: 'audio' }] }
    ]
  });
  viewer.onTrack('alice', { track: track('audio', 'carol'), transceiver: { mid: '5' } });
  await Promise.resolve();
  assert.equal(viewer.audio.get('aud-3').element.plays, 1);
  assert.equal(viewer.audio.get('aud-1').element.plays, 1);

  viewer.destroy();
  assert.equal(videos.every((video) => video.paused && video.srcObject === null), true);
  assert.equal(viewer.audio.size, 0);
  assert.equal(viewer.elements.size, 0);
});

test('a rejected playback leaves the subscription up and can be retried', async () => {
  const ui = entryDocument();
  const viewer = entryViewer(ui, []);
  viewer.contact = 'alice';
  viewer.applyPublication({
    show: 'participants',
    outputs: [
      { id: 'cam-1', role: 'video', kind: 'camera', participant: 'alice', label: 'Alice' },
      { id: 'cam-2', role: 'video', kind: 'camera', participant: 'bob', label: 'Bob' },
      { id: 'aud-1', role: 'audio', kind: 'audio', participant: 'alice', label: 'Alice' }
    ]
  });
  viewer.receiveTracks({
    publicationId: 'pub',
    outputs: [
      { id: 'cam-1', mids: [{ mid: '0', kind: 'video' }] },
      { id: 'cam-2', mids: [{ mid: '1', kind: 'video' }] },
      { id: 'aud-1', mids: [{ mid: '2', kind: 'audio' }] }
    ]
  });
  viewer.onTrack('alice', { track: track('video', 'va'), transceiver: { mid: '0' } });
  viewer.onTrack('alice', { track: track('video', 'vb'), transceiver: { mid: '1' } });
  viewer.onTrack('alice', { track: track('audio', 'aa'), transceiver: { mid: '2' } });
  viewer.elements.get('cam-1').querySelector('video').fail = true;
  const subscribed = viewer.subscribed;
  viewer.enter();
  await Promise.resolve();
  assert.equal(viewer.closed, false);
  assert.equal(viewer.subscribed, subscribed);
  assert.equal(viewer.state, 'playing');
  assert.equal(viewer.elements.get('cam-2').querySelector('video').plays, 1);
  assert.equal(viewer.audio.get('aud-1').element.plays, 1);
  assert.equal(ui.retry.hidden, false);
  ui.retry.onclick();
  await Promise.resolve();
  assert.equal(viewer.elements.get('cam-1').querySelector('video').plays, 2);
  assert.equal(viewer.audio.get('aud-1').element.plays, 1);
  assert.equal(ui.retry.hidden, true);
});

test('an interface video track that arrives after entry still starts playback', async () => {
  const ui = entryDocument();
  const viewer = entryViewer(ui, []);
  viewer.contact = 'alice';
  viewer.applyPublication({
    show: 'interface',
    outputs: [
      { id: 'interface', role: 'video', kind: 'interface', label: 'Video call' },
      { id: 'aud-1', role: 'audio', kind: 'audio', participant: 'alice', label: 'Alice' }
    ]
  });
  viewer.receiveTracks({
    publicationId: 'pub',
    outputs: [
      { id: 'interface', mids: [{ mid: '1', kind: 'video' }] },
      { id: 'aud-1', mids: [{ mid: '2', kind: 'audio' }] }
    ]
  });
  viewer.onTrack('alice', { track: track('audio', 'aa'), transceiver: { mid: '2' } });
  assert.equal(ui.root.dataset.entry, 'ready');
  viewer.enter();
  await Promise.resolve();
  const video = viewer.elements.get('interface').querySelector('video');
  assert.equal(video.plays, 0);
  assert.equal(viewer.audio.get('aud-1').element.plays, 1);
  const picture = track('video', 'surface');
  viewer.onTrack('alice', { track: picture, transceiver: { mid: '1' } });
  await Promise.resolve();
  assert.equal(video.plays, 1);
  assert.equal(video.muted, true);
  assert.equal(video.srcObject.getVideoTracks()[0], picture);
  assert.equal(viewer.audio.get('aud-1').element.plays, 1);
  viewer.paint();
  assert.equal(video.plays, 1);
  assert.equal(viewer.subscribed, 'interface,aud-1');
  assert.equal(viewer.closed, false);
});

test('interface video playback follows track arrival, replacement, and ending', async () => {
  const ui = entryDocument();
  const viewer = entryViewer(ui, []);
  viewer.contact = 'alice';
  viewer.applyPublication({
    show: 'interface',
    outputs: [
      { id: 'interface', role: 'video', kind: 'interface', label: 'Video call' },
      { id: 'aud-1', role: 'audio', kind: 'audio', participant: 'alice', label: 'Alice' },
      { id: 'aud-2', role: 'audio', kind: 'audio', participant: 'bob', label: 'Bob' }
    ]
  });
  viewer.receiveTracks({
    publicationId: 'pub',
    outputs: [
      { id: 'interface', mids: [{ mid: '1', kind: 'video' }] },
      { id: 'aud-1', mids: [{ mid: '2', kind: 'audio' }] },
      { id: 'aud-2', mids: [{ mid: '3', kind: 'audio' }] }
    ]
  });
  viewer.onTrack('alice', { track: track('audio', 'aa'), transceiver: { mid: '2' } });
  viewer.onTrack('alice', { track: track('audio', 'ab'), transceiver: { mid: '3' } });
  viewer.enter();
  const video = viewer.elements.get('interface').querySelector('video');
  assert.equal(video.plays, 0);
  assert.equal(viewer.playbackTrack.has('interface'), false);
  assert.equal(viewer.audio.get('aud-1').element.plays, 1);
  assert.equal(viewer.audio.get('aud-2').element.plays, 1);

  const first = track('video', 'surface-1');
  viewer.onTrack('alice', { track: first, transceiver: { mid: '1' } });
  await Promise.resolve();
  assert.equal(video.plays, 1);
  assert.equal(video.srcObject.getVideoTracks()[0].id, 'surface-1');

  first.readyState = 'ended';
  const second = track('video', 'surface-2');
  viewer.pending.set('1', second);
  viewer.trackMids.set(second, '1');
  viewer.paint();
  await Promise.resolve();
  assert.equal(video.plays, 2);
  assert.equal(video.srcObject.getVideoTracks()[0].id, 'surface-2');

  second.readyState = 'ended';
  viewer.paint();
  assert.equal(viewer.playbackTrack.has('interface'), false);
  assert.equal(video.plays, 2);
  assert.equal(viewer.media.get('interface').getVideoTracks().length, 0);
});

test('the broadcaster disconnecting before entry does not offer entry', () => {
  const ui = entryDocument();
  const viewer = entryViewer(ui, []);
  viewer.contact = 'alice';
  viewer.applyPublication({
    show: 'participants',
    outputs: [{ id: 'cam-1', role: 'video', kind: 'camera', participant: 'alice', label: 'Alice' }]
  });
  viewer.receiveTracks({
    publicationId: 'pub',
    outputs: [{ id: 'cam-1', mids: [{ mid: '0', kind: 'video' }] }]
  });
  viewer.onTrack('alice', { track: track('video', 'va'), transceiver: { mid: '0' } });
  assert.equal(ui.root.dataset.entry, 'ready');
  viewer.onChannelClose('alice');
  assert.equal(ui.root.dataset.entry, 'failed');
  assert.equal(ui.welcome.hidden, true);
  assert.equal(ui.error.hidden, false);
  const plays = viewer.elements.get('cam-1')?.querySelector('video')?.plays || 0;
  viewer.enter();
  assert.equal(plays, 0);
  assert.equal(viewer.closed, true);
});

function entryViewer(ui, subscriptions) {
  const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
  const viewer = new SwarmcastViewer(
    { connection: { on() {}, removeListener() {} } },
    {
      publicKey: 'viewer',
      peerManager: {
        hasConnectionWithPeer: () => true,
        removePeerConnection() {}
      },
      sendSwarmcast: async (...args) => {
        subscriptions.push(args);
      }
    },
    { publicationId: 'pub', broadcaster: 'alice', callId: 'room-1' }
  );
  viewer.ui = ui;
  return viewer;
}

function stepDone(ui, label) {
  return ui.progress.children.find((item) => item.textContent === label)?.dataset.done === 'yes';
}

function entryDocument() {
  function element(tag) {
    const node = {
      tag,
      hidden: false,
      textContent: '',
      dataset: {},
      className: '',
      children: [],
      onclick: null,
      plays: 0,
      fail: false,
      paused: true,
      muted: false,
      autoplay: false,
      playsInline: false,
      srcObject: null,
      removed: false,
      appendChild(child) { this.children.push(child); },
      querySelector(selector) {
        if (selector === 'video') return this.children.find((child) => child.tag === 'video') || null;
        return null;
      },
      play() {
        node.plays += 1;
        if (node.fail) {
          node.fail = false;
          return Promise.reject(Object.assign(new Error('autoplay'), { name: 'NotAllowedError' }));
        }
        node.paused = false;
        return Promise.resolve();
      },
      pause() { node.paused = true; },
      remove() { node.removed = true; }
    };
    return node;
  }
  const ui = {
    root: element('div'),
    title: element('h1'),
    progress: element('ol'),
    pending: element('p'),
    welcome: element('div'),
    enter: element('button'),
    error: element('div'),
    errorText: element('p'),
    stage: element('div'),
    retry: element('button'),
    holder: element('div'),
    audioHolder: element('div'),
    status: element('div')
  };
  ui.welcome.hidden = true;
  ui.status.querySelector = () => element('p');
  global.MediaStream = FakeStream;
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.document = {
    body: { appendChild() {} },
    createElement: (tag) => element(tag),
    querySelector(selector) {
      if (selector === '.swarmcast-viewer') return ui.root;
      if (selector === '.swarmcast-entry-title') return ui.title;
      if (selector === '.swarmcast-entry-progress') return ui.progress;
      if (selector === '.swarmcast-entry-pending') return ui.pending;
      if (selector === '.swarmcast-entry-welcome') return ui.welcome;
      if (selector === '.swarmcast-entry-enter') return ui.enter;
      if (selector === '.swarmcast-entry-error') return ui.error;
      if (selector === '.swarmcast-entry-error-text') return ui.errorText;
      if (selector === '.swarmcast-stage') return ui.stage;
      if (selector === '.swarmcast-playback-retry') return ui.retry;
      if (selector === '.swarmcast-outputs') return ui.holder;
      if (selector === '.swarmcast-audio') return ui.audioHolder;
      if (String(selector).includes('swarmcast-status')) return ui.status;
      return null;
    }
  };
  return ui;
}

function sendingConnection() {
  const pc = peerConnection();
  pc.addTrack = (media) => {
    const sender = {
      track: media,
      parameters: null,
      getParameters: () => ({ encodings: [{}] }),
      setParameters(params) {
        this.parameters = params;
        return Promise.resolve();
      }
    };
    pc.transceivers.push({
      sender,
      mid: String(pc.transceivers.length),
      direction: 'sendonly',
      currentDirection: 'sendonly'
    });
    pc.added.push(media);
    return sender;
  };
  return pc;
}

test('quality presets set capture constraints, sender bitrate, and scaled video-box limits', async () => {
  const { QUALITY_PRESETS, displayQuality, streamQuality, stepQuality } = require('../../../mods/videocall/lib/swarmcast');
  assert.deepEqual(
    [QUALITY_PRESETS.economy, QUALITY_PRESETS.standard, QUALITY_PRESETS.high, QUALITY_PRESETS.premium].map((preset) => [
      preset.maxWidth,
      preset.maxHeight,
      preset.maxFramerate,
      preset.maxBitrate
    ]),
    [
      [640, 360, 10, 400000],
      [960, 540, 15, 800000],
      [1280, 720, 20, 1500000],
      [1920, 1080, 30, 3000000]
    ]
  );
  const fitted = displayQuality(QUALITY_PRESETS.premium, {
    width: 1280,
    height: 720,
    frameRate: 20,
    capabilities: { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 24 } }
  });
  assert.equal(fitted.maxWidth, 1280);
  assert.equal(fitted.maxHeight, 720);
  assert.equal(fitted.maxFramerate, 20);
  assert.equal(fitted.maxBitrate, 3000000);
  assert.deepEqual(stepQuality(1920, 1, 'size', { width: 1280, height: 720 }), { maxWidth: 1280, maxHeight: 720 });
  assert.equal(stepQuality(30, 1, 'rate', { frameRate: 20 }), 20);
  const one = streamQuality(QUALITY_PRESETS.standard, 1);
  const many = streamQuality(QUALITY_PRESETS.standard, 4);
  assert.equal(one.maxWidth, 960);
  assert.equal(one.maxBitrate, 800000);
  assert.ok(many.maxWidth < one.maxWidth);
  assert.ok(many.maxFramerate < one.maxFramerate);
  assert.ok(many.maxBitrate < one.maxBitrate);
  assert.equal(displayQuality(QUALITY_PRESETS.premium).maxBitrate, streamQuality(QUALITY_PRESETS.premium, 1).maxBitrate);

  quietLink();
  const mod = harness();
  placeCameras(mod);
  for (const id of ['a-v', 'b-v']) {
    const video = [...mod.streams.entries.values()]
      .flatMap((entry) => entry.mediaStream.getVideoTracks())
      .find((item) => item.id === id);
    video.getSettings = () => ({ width: 1280, height: 720, frameRate: 30 });
  }
  assert.equal(await mod.startBroadcast({
    video: { mode: 'subset', participants: ['alice', 'bob'] },
    audio: { mode: 'subset', participants: ['alice', 'bob'] },
    quality: { preset: 'standard', maxWidth: 960, maxHeight: 540, maxFramerate: 15 }
  }), true);
  const shared = sendingConnection();
  mod.peerManager.peers.set('viewer', shared);
  mod.acceptBroadcastSubscribe('viewer', {
    publicationId: mod.swarmcast.id,
    outputIds: mod.swarmcast.outputs.map((output) => output.id)
  });
  await Promise.resolve();
  const videoSenders = mod.swarmcast.childFor('viewer').media_streams.filter((item) => item.kind === 'video');
  assert.equal(videoSenders.length, 2);
  const two = streamQuality(QUALITY_PRESETS.standard, 2);
  for (const item of videoSenders) {
    assert.equal(item.sender.parameters.encodings[0].maxBitrate, two.maxBitrate);
    assert.equal(item.sender.parameters.encodings[0].maxFramerate, two.maxFramerate);
    assert.equal(item.sender.parameters.encodings[0].scaleResolutionDownBy, 1280 / two.maxWidth);
  }
  mod.stopBroadcast();

  const surface = track('video', 'surface');
  surface.getSettings = () => ({ width: 1920, height: 1080, frameRate: 30 });
  let requested = null;
  let applied = null;
  surface.applyConstraints = async (constraints) => {
    applied = constraints;
  };
  global.navigator.mediaDevices = {
    getDisplayMedia: async (constraints) => {
      requested = constraints;
      return new FakeStream([surface]);
    }
  };
  mod.streams.register = (fields) => {
    const entry = { id: 'surface-1', ...fields };
    mod.streams.entries.set(entry.id, entry);
    return entry;
  };
  mod.streams.remove = (id) => mod.streams.entries.delete(id);
  assert.equal(await mod.startBroadcast({
    video: { mode: 'interface' },
    audio: { mode: 'everyone' },
    quality: { preset: 'premium', maxWidth: 1920, maxHeight: 1080, maxFramerate: 30 }
  }), true);
  assert.equal(requested.audio, false);
  assert.equal(requested.video.width.max, 1920);
  assert.equal(requested.video.frameRate.max, 30);
  assert.equal(applied.width.max, 1920);
  assert.equal(mod.swarmcastSource.width, 1920);
  assert.equal(mod.swarmcastOutgoing.maxBitrate, 3000000);
  const screen = sendingConnection();
  mod.peerManager.peers.set('screen-viewer', screen);
  mod.acceptBroadcastSubscribe('screen-viewer', { publicationId: mod.swarmcast.id, outputIds: ['interface'] });
  await Promise.resolve();
  const screenSender = mod.swarmcast.childFor('screen-viewer').media_streams.find((item) => item.kind === 'video').sender;
  assert.equal(screenSender.parameters.encodings[0].maxBitrate, 3000000);
  assert.equal(screenSender.parameters.encodings[0].maxFramerate, 30);
  assert.equal(screenSender.parameters.encodings[0].scaleResolutionDownBy, undefined);
  mod.stopBroadcast();
});

test('the active broadcast keeps one link and applies reopened settings', async () => {
  quietLink();
  const copied = [];
  global.window = { location: { origin: 'https://saito.example', href: 'https://saito.example/videocall' }, addEventListener() {}, removeEventListener() {} };
  const mod = harness();
  placeCameras(mod);
  const indicator = { textContent: 'Listening', className: 'transcript-indicator' };
  const log = { textContent: 'Ada: hello', className: 'swarmcast-transcript-log' };
  const linkNode = { href: '', textContent: '', hidden: true };
  const copyButton = { onclick: null };
  const settingsButton = { onclick: null };
  const copiedNote = { hidden: true, textContent: '' };
  const bar = {
    remove() { live = null; },
    querySelector(selector) {
      if (selector === '.swarmcast-live-copy') return copyButton;
      if (selector === '.swarmcast-live-settings') return settingsButton;
      if (selector === '.swarmcast-live-link') return linkNode;
      if (selector === '.swarmcast-transcript-log') return log;
      if (selector === '.swarmcast-live-copied') return copiedNote;
      return null;
    }
  };
  let live = null;
  const stage = {
    html: '',
    insertAdjacentHTML(_position, html) {
      this.html = html;
      const href = /href="([^"]+)"/.exec(html)[1].replaceAll('&amp;', '&');
      linkNode.href = href;
      linkNode.textContent = /swarmcast-transcript-link"[^>]*>([^<]*)</.exec(html)[1];
      live = bar;
    }
  };
  global.document = {
    getElementById: () => null,
    querySelector(selector) {
      if (selector.includes('video-container-large')) return stage;
      if (selector === '.transcript-indicator') return indicator;
      if (selector === '.swarmcast-live') return live;
      if (selector === '.swarmcast-live-copied') return copiedNote;
      if (selector === '.swarmcast-transcript-log') return log;
      return null;
    },
    querySelectorAll(selector) {
      return selector === '.swarmcast-live' && live ? [live] : [];
    }
  };
  global.navigator = {
    clipboard: { writeText: async (value) => { copied.push(value); } },
    mediaDevices: { getDisplayMedia: async () => { throw new Error('share was not requested'); } }
  };
  assert.equal(await mod.startBroadcast({
    video: { mode: 'subset', participants: ['alice', 'bob'] },
    audio: { mode: 'subset', participants: ['alice', 'bob'] },
    quality: { preset: 'standard', maxWidth: 960, maxHeight: 540, maxFramerate: 15 }
  }), true);
  const id = mod.swarmcast.id;
  const link = mod.swarmcastLink;
  assert.equal(copied[0], link);
  assert.equal(link.startsWith('https://saito.example/videocall/swarmcast/'), true);
  assert.equal(stage.html.includes('swarmcast-transcript-link'), true);
  assert.equal(stage.html.includes(link.replaceAll('&', '&amp;')), true);
  assert.equal(linkNode.href, link);
  assert.equal(indicator.textContent, 'Listening');
  assert.equal(log.textContent, 'Ada: hello');
  assert.equal(await mod.copyBroadcastLink(), true);
  assert.equal(copied[1], link);
  assert.equal(copiedNote.textContent, 'Link copied');
  let opened = 0;
  mod.swarmcasts.setup = { render() { opened += 1; } };
  mod.swarmcasts.showSetup();
  assert.equal(opened, 1);
  assert.equal(mod.swarmcast.id, id);
  assert.equal(mod.swarmcastLink, link);

  const Setup = require('../../../mods/videocall/lib/ui/overlays/swarmcast-setup');
  const setup = new Setup(mod.app, mod);
  const root = settingsForm({ video: 'participants', audio: 'participants', videoChecked: [], audioChecked: [] });
  root.inputs.push(
    { name: 'swarmcast-quality', value: 'economy', type: 'radio', checked: false },
    { name: 'swarmcast-quality', value: 'standard', type: 'radio', checked: false }
  );
  setup.populate(root, mod.swarmcastConfig);
  assert.equal(root.querySelector('input[name="swarmcast-video"]:checked').value, 'participants');
  assert.equal(root.inputs.find((input) => input.name === 'swarmcast-video-member' && input.value === 'alice').checked, true);
  assert.equal(root.inputs.find((input) => input.name === 'swarmcast-video-member' && input.value === 'bob').checked, true);
  assert.equal(root.inputs.find((input) => input.name === 'swarmcast-audio-member' && input.value === 'bob').checked, true);
  assert.equal(root.dataset.preset, 'standard');

  assert.equal(await mod.reviseBroadcast({
    video: { mode: 'subset', participants: ['alice'] },
    audio: { mode: 'subset', participants: ['alice'] },
    quality: { preset: 'high', maxWidth: 1280, maxHeight: 720, maxFramerate: 20 }
  }), true);
  assert.equal(mod.swarmcast.id, id);
  assert.equal(mod.swarmcastLink, link);
  assert.deepEqual(videoParticipants(mod), ['alice']);
  assert.deepEqual(audioParticipants(mod), ['alice']);
  assert.equal(await mod.reviseBroadcast({
    video: { mode: 'interface' },
    audio: { mode: 'everyone' },
    quality: { preset: 'premium', maxWidth: 1920, maxHeight: 1080, maxFramerate: 30 }
  }), false);
  assert.equal(mod.swarmcast.id, id);
  assert.equal(mod.swarmcastLink, link);
  assert.deepEqual(videoParticipants(mod), ['alice']);

  mod.stopBroadcast();
  assert.equal(mod.swarmcast, null);
  assert.equal(mod.swarmcastLink, null);
  assert.equal(mod.swarmcastConfig, null);
  assert.equal(live, null);

  const surface = track('video', 'surface');
  surface.getSettings = () => ({ width: 1920, height: 1080, frameRate: 30 });
  const applied = [];
  surface.applyConstraints = async (constraints) => { applied.push(constraints); };
  global.navigator.mediaDevices = {
    getDisplayMedia: async () => new FakeStream([surface])
  };
  mod.streams.register = (fields) => {
    const entry = { id: 'surface-1', ...fields };
    mod.streams.entries.set(entry.id, entry);
    return entry;
  };
  mod.streams.remove = (id) => mod.streams.entries.delete(id);
  assert.equal(await mod.startBroadcast({
    video: { mode: 'interface' },
    audio: { mode: 'none' },
    quality: { preset: 'premium', maxWidth: 1920, maxHeight: 1080, maxFramerate: 30 }
  }), true);
  const kept = mod.swarmcastLink;
  const screen = sendingConnection();
  mod.peerManager.peers.set('viewer', screen);
  mod.acceptBroadcastSubscribe('viewer', { publicationId: mod.swarmcast.id, outputIds: ['interface'] });
  await Promise.resolve();
  assert.equal(await mod.reviseBroadcast({
    video: { mode: 'interface' },
    audio: { mode: 'none' },
    quality: { preset: 'economy', maxWidth: 640, maxHeight: 360, maxFramerate: 10 }
  }), true);
  assert.equal(mod.swarmcastLink, kept);
  assert.equal(applied.at(-1).width.max, 640);
  assert.equal(applied.at(-1).frameRate.max, 10);
  const sender = mod.swarmcast.childFor('viewer').media_streams.find((item) => item.kind === 'video').sender;
  assert.equal(sender.parameters.encodings[0].maxBitrate, 400000);
  assert.equal(sender.parameters.encodings[0].maxFramerate, 10);
  mod.stopBroadcast();

  const ui = entryDocument();
  ui.log = { textContent: 'Existing line' };
  ui.share = { hidden: true, href: '', textContent: '' };
  const previous = global.document.querySelector;
  global.document.querySelector = (selector) => {
    if (selector === '.swarmcast-transcript-link') return ui.share;
    if (selector === '.swarmcast-transcript-log') return ui.log;
    return previous(selector);
  };
  global.window.location = {
    href: 'https://saito.example/videocall/swarmcast/pub?broadcaster=alice&call_id=room-1'
  };
  const viewer = entryViewer(ui, []);
  viewer.entry = 'viewing';
  viewer.refreshEntry();
  assert.equal(ui.log.textContent, 'Existing line');
  assert.equal(ui.share.href, global.window.location.href);
  assert.equal(ui.share.hidden, false);
  viewer.destroy();
});

test('startup keeps the overlay open until the broadcast is live', async () => {
  quietLink();
  const mod = harness();
  placeCameras(mod);
  const Setup = require('../../../mods/videocall/lib/ui/overlays/swarmcast-setup');
  const setup = new Setup(mod.app, mod);
  let closed = 0;
  setup.overlay.close = () => {
    closed += 1;
  };
  const base = settingsForm({ video: 'interface', audio: 'all' });
  const start = { disabled: false, textContent: 'Start Swarmcasting' };
  const loading = { hidden: true };
  const error = { hidden: true, textContent: '' };
  const linkNode = { href: '', textContent: '' };
  const original = base.querySelector.bind(base);
  base.setAttribute = () => {};
  base.querySelector = (selector) => {
    if (selector === '.swarmcast-setup-start') return start;
    if (selector === '.swarmcast-setup-loading') return loading;
    if (selector === '.swarmcast-setup-error') return error;
    if (selector === '.swarmcast-setup-live-link') return linkNode;
    return original(selector);
  };
  const surface = track('video', 'surface');
  surface.getSettings = () => ({ width: 1280, height: 720, frameRate: 15 });
  surface.applyConstraints = async () => {};
  const captured = new FakeStream([surface]);
  let requested = null;
  let release = null;
  global.navigator.mediaDevices = {
    getDisplayMedia: async (constraints) => {
      requested = constraints;
      return new Promise((resolve) => {
        release = () => resolve(captured);
      });
    }
  };
  mod.streams.register = (fields) => {
    const entry = { id: 'surface-1', ...fields };
    mod.streams.entries.set(entry.id, entry);
    return entry;
  };
  mod.streams.remove = (id) => mod.streams.entries.delete(id);
  const pending = setup.confirm(base);
  const repeated = await setup.confirm(base);
  assert.equal(repeated, false);
  assert.equal(base.dataset.state, 'starting');
  assert.equal(start.disabled, true);
  assert.equal(loading.hidden, false);
  assert.equal(closed, 0);
  assert.equal(mod.swarmcastLink, undefined);
  release();
  assert.equal(await pending, true);
  assert.equal(base.dataset.state, 'live');
  assert.equal(loading.hidden, true);
  assert.equal(start.disabled, false);
  assert.equal(linkNode.textContent, mod.swarmcastLink);
  assert.equal(requested.preferCurrentTab, true);
  assert.equal(requested.selfBrowserSurface, 'include');
  assert.equal(requested.audio, false);
  const id = mod.swarmcast.id;
  const link = mod.swarmcastLink;
  setup.overlay.close();
  assert.equal(closed, 1);
  assert.equal(mod.swarmcast.id, id);
  setup.showState(base, mod.swarmcast ? 'live' : 'settings');
  assert.equal(base.dataset.state, 'live');
  assert.equal(linkNode.textContent, link);
  assert.equal(await setup.terminate(base), true);
  assert.equal(mod.swarmcast, null);
  assert.equal(base.dataset.state, 'settings');
  assert.equal(start.textContent, 'Start Swarmcasting');

  global.navigator.mediaDevices.getDisplayMedia = async () => {
    throw new Error('denied');
  };
  assert.equal(await setup.confirm(base), false);
  assert.equal(base.dataset.state, 'settings');
  assert.equal(error.hidden, false);
  assert.equal(error.textContent, 'The broadcast could not be started');
  assert.equal(base.querySelector('input[name="swarmcast-video"]:checked').value, 'interface');
  assert.equal(mod.swarmcast, null);

  global.navigator.mediaDevices.getDisplayMedia = async () => captured;
  assert.equal(await setup.confirm(base), true);
  const secondId = mod.swarmcast.id;
  const kept = mod.swarmcastLink;
  base.dataset.state = 'editing';
  assert.equal(await setup.confirm(base), true);
  assert.equal(mod.swarmcast.id, secondId);
  assert.equal(mod.swarmcastLink, kept);
  assert.equal(base.dataset.state, 'live');
  mod.stopBroadcast();
});

test('the viewer lays out videos locally and keeps its own controls', async () => {
  const { fitGrid, arrangeTiles, MAX_TILE } = require('../../../mods/videocall/lib/ui/swarmcast-layout');
  const one = arrangeTiles(1, 1600, 900, 'auto');
  assert.equal(one.columns, 1);
  assert.equal(one.tileWidth, MAX_TILE);
  assert.ok(Math.abs(one.tileWidth / one.tileHeight - 16 / 9) < 0.001);
  const filled = arrangeTiles(1, 1600, 900, 'grid');
  assert.ok(filled.tileWidth > one.tileWidth);
  const pair = fitGrid(2, 1600, 900, { maxTile: MAX_TILE });
  assert.equal(pair.columns, 2);
  assert.equal(pair.rows, 1);
  assert.ok(pair.tileWidth > 500 && pair.tileWidth < 1000);
  const three = fitGrid(3, 1280, 720, { maxTile: MAX_TILE });
  assert.equal(three.columns, 2);
  const four = fitGrid(4, 1280, 720, { maxTile: MAX_TILE });
  assert.equal(four.columns, 2);
  assert.equal(four.rows, 2);
  const crowd = fitGrid(9, 1280, 720, { maxTile: Infinity });
  assert.ok(crowd.columns >= 3);
  assert.ok(crowd.tileWidth * crowd.columns <= 1280);
  assert.equal(fitGrid(2, 360, 700, { maxTile: MAX_TILE }).columns, 1);
  assert.ok(fitGrid(4, 1600, 320, { maxTile: Infinity }).columns >= 3);

  const markup = require('../../../mods/videocall/lib/ui/swarmcast.template')('playing', 'Live');
  assert.equal(markup.includes('>LIVE<') || markup.includes('\n          LIVE'), true);
  assert.equal(markup.includes('Share this Swarmcast'), true);
  assert.equal(markup.includes('swarmcast-feed-count'), true);
  assert.equal(markup.includes('swarmcast-share-field'), true);
  assert.equal(markup.includes('swarmcast-toolbar'), true);
  assert.equal(markup.includes('data-layout="auto"'), true);
  assert.equal(markup.includes('>Grid</span>'), true);
  assert.equal(markup.includes('>Focus</span>'), true);
  assert.equal(markup.includes('swarmcast-leave'), true);
  assert.equal(markup.includes('fa-right-from-bracket'), true);
  assert.equal(markup.includes('fa-phone'), false);
  const css = require('fs').readFileSync(
    require('path').join(__dirname, '../../../mods/videocall/web/css/videocall-swarmcast.css'),
    'utf8'
  );
  assert.equal(css.includes('justify-content: center'), true);
  assert.equal(css.includes('object-fit: contain'), true);

  const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
  const sent = [];
  let dropped = '';
  const viewer = new SwarmcastViewer(
    { connection: { on() {}, removeListener() {} } },
    {
      peerManager: { removePeerConnection(id) { dropped = id; } },
      sendSwarmcast() { sent.push(Array.from(arguments)); }
    },
    { publicationId: 'pub', broadcaster: 'alice', callId: 'room-1' }
  );
  const boxes = {};
  const box = (id) => {
    boxes[id] = { dataset: { output: id }, style: {} };
    return boxes[id];
  };
  const holder = {
    dataset: {},
    style: { props: {}, setProperty(name, value) { this.props[name] = value; } },
    children: [],
    insertBefore(node) {
      this.children = this.children.filter((child) => child !== node);
      this.children.push(node);
    }
  };
  const stage = { requestFullscreen() { stage.requested = (stage.requested || 0) + 1; } };
  const previousDocument = global.document;
  const previousWindow = global.window;
  global.window = { history: { length: 1, back() {} }, addEventListener() {}, removeEventListener() {} };
  global.document = {
    fullscreenElement: null,
    exitFullscreen() { this.exited = (this.exited || 0) + 1; },
    querySelector(selector) {
      if (selector === '.swarmcast-outputs') return holder;
      if (selector === '.swarmcast-view') return { clientWidth: 1280, clientHeight: 720 };
      if (selector === '.swarmcast-stage') return stage;
      if (selector === '.swarmcast-viewer') return { remove() { this.removed = true; } };
      return null;
    }
  };
  viewer.stageWidth = 1280;
  viewer.stageHeight = 720;
  viewer.publication = {
    outputs: ['a', 'b', 'c', 'd'].map((id) => ({ id, role: 'video', participant: id }))
  };
  for (const id of ['a', 'b', 'c', 'd']) {
    viewer.elements.set(id, box(id));
    viewer.media.set(id, {
      getTracks: () => [{ id: `track-${id}`, readyState: 'live' }],
      removeTrack() {}
    });
  }
  const before = viewer.media.get('a');
  const fit = viewer.arrange();
  assert.equal(fit.mode, 'auto');
  assert.equal(fit.columns, 2);
  assert.equal(boxes.a.style.width, boxes.d.style.width);
  assert.equal(
    Math.round(Number.parseFloat(boxes.a.style.width) / Number.parseFloat(boxes.a.style.height)),
    Math.round(16 / 9)
  );
  viewer.setLayout('grid');
  viewer.setLayout('focus');
  assert.equal(viewer.lastFit.mode, 'focus');
  assert.equal(boxes.a.dataset.role, 'focus');
  assert.equal(boxes.b.dataset.role, 'side');
  viewer.moveTile('c', 'a');
  assert.deepEqual(viewer.order, ['c', 'a', 'b', 'd']);
  assert.equal(viewer.lastFit.focus, 'c');
  assert.equal(holder.children[0], boxes.c);
  viewer.setTileSize('b', 400);
  assert.equal(viewer.sizes.b, 400);
  assert.equal(boxes.b.style.height, `${Math.round(400 / (16 / 9))}px`);
  viewer.setSplit(0.8);
  assert.equal(holder.style.props['--swarmcast-split'], '80%');
  assert.equal(viewer.media.get('a'), before);
  viewer.resetLayout();
  assert.equal(viewer.layout, 'auto');
  assert.equal(viewer.customOrder, false);
  assert.deepEqual(viewer.sizes, {});
  assert.deepEqual(viewer.order, ['a', 'b', 'c', 'd']);

  const audio = { muted: false, play() { return Promise.resolve(); } };
  viewer.audio.set('mic', { element: audio, stream: {}, output: { muted: false } });
  viewer.setMuted(true);
  assert.equal(audio.muted, true);
  viewer.setMuted(false);
  assert.equal(audio.muted, false);
  assert.equal(sent.length, 0);

  viewer.toggleFullscreen();
  assert.equal(stage.requested, 1);
  global.document.fullscreenElement = stage;
  viewer.toggleFullscreen();
  assert.equal(global.document.exited, 1);

  const disabled = { dataset: { camera: 'live' } };
  viewer.elements.set('a', disabled);
  viewer.ensureOutput({ id: 'a', camera: 'disabled' });
  assert.equal(disabled.dataset.camera, 'disabled');
  assert.equal(viewer.elements.get('a'), disabled);
  viewer.publication.outputs.push({ id: 'e', role: 'video', participant: 'e' });
  viewer.elements.set('e', box('e'));
  viewer.arrange();
  assert.equal(viewer.order.includes('e'), true);
  viewer.publication.outputs = viewer.publication.outputs.filter((output) => output.id !== 'e');
  viewer.removeOutput('e');
  assert.equal(viewer.elements.has('e'), false);
  assert.equal(viewer.order.includes('e'), false);

  const broadcast = { id: 'pub' };
  viewer.contact = 'alice';
  viewer.leave();
  assert.equal(dropped, 'alice');
  assert.equal(viewer.closed, true);
  assert.equal(broadcast.id, 'pub');
  assert.equal(sent.some((item) => String(item[1]).includes('ended')), false);

  global.document = previousDocument;
  global.window = previousWindow;
});

test('the viewer header counts video feeds and the share field keeps the full link', async () => {
  const SwarmcastViewer = require('../../../mods/videocall/lib/ui/swarmcast');
  const href = 'https://saito.example/videocall/swarmcast/pub?broadcaster=alice&call_id=room-1';
  const feeds = { textContent: '' };
  const field = { value: '', title: '' };
  const open = { href: '', hidden: true, querySelector: () => ({}) };
  const copy = {
    dataset: {},
    setAttribute() {},
    addEventListener(_name, handler) { this.onclick = handler; }
  };
  const copied = [];
  const previousDocument = global.document;
  const previousWindow = global.window;
  const previousNavigator = global.navigator;
  global.window = { location: { href }, addEventListener() {}, removeEventListener() {} };
  global.navigator = { clipboard: { writeText: async (value) => { copied.push(value); } } };
  global.document = {
    querySelector(selector) {
      if (selector === '.swarmcast-feed-count') return feeds;
      if (selector === '.swarmcast-share-field') return field;
      if (selector === '.swarmcast-transcript-link') return open;
      if (selector === '.swarmcast-share-copy') return copy;
      if (selector === '.swarmcast-transcript-log') return { textContent: 'Existing line' };
      return null;
    }
  };
  const viewer = new SwarmcastViewer(
    { connection: { on() {}, removeListener() {} } },
    { peerManager: { removePeerConnection() {} }, sendSwarmcast() {} },
    { publicationId: 'pub', broadcaster: 'alice', callId: 'room-1' }
  );
  viewer.entry = 'viewing';
  viewer.refreshEntry();
  assert.equal(open.href, href);
  assert.equal(open.hidden, false);
  assert.equal(field.value, href);
  assert.equal(field.title, href);
  viewer.bindShare();
  await viewer.copyShareLink();
  assert.deepEqual(copied, [href]);
  assert.equal(copy.dataset.copied, 'yes');
  viewer.publication = {
    outputs: [
      { id: 'a', role: 'video' },
      { id: 'b', role: 'video' },
      { id: 'mic', role: 'audio' }
    ]
  };
  viewer.elements.set('a', { dataset: {} });
  viewer.elements.set('b', { dataset: {} });
  viewer.arrange();
  assert.equal(feeds.textContent, '2 feeds');
  viewer.destroy();
  global.document = previousDocument;
  global.window = previousWindow;
  global.navigator = previousNavigator;
});

