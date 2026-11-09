const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { SwarmcastPublication, syncSenders, trackMap } = require('../../../mods/videocall/lib/swarmcast-publication');
const Videocall = require('../../../mods/videocall/videocall');

class FakeStream {
  constructor(tracks = []) {
    this.tracks = tracks.slice();
    this.listeners = {};
  }
  getTracks() {
    return this.tracks.filter((track) => track.readyState !== 'ended');
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
  return mod;
}

test('public publication documents omit registry ids', () => {
  const pub = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  pub.addCamera({ registryId: 'registry-alice', participant: 'alice', label: 'Alice' });
  pub.addCamera({ registryId: 'registry-bob', participant: 'bob', label: 'Bob' });
  pub.outputs.push({ id: 'program', label: 'Call', inputs: ['cam-1', 'cam-2'], registryId: 'composite-1' });
  const doc = pub.document();
  assert.equal(JSON.stringify(doc).includes('registry'), false);
  assert.equal(doc.id, 'pub');
  assert.equal(doc.broadcaster, 'alice');
  assert.deepEqual(doc.outputs[0], { id: 'cam-1', label: 'Alice', inputs: ['cam-1'] });
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
  mod.broadcast = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.publishCallCameras();
  const doc = mod.broadcast.document();
  assert.deepEqual(
    doc.outputs.map((output) => output.label),
    ['You', 'bob']
  );
  assert.equal(doc.outputs.some((output) => output.inputs.includes('cam-1')), true);
  assert.equal(doc.outputs.some((output) => output.inputs.includes('cam-2')), true);
  assert.equal(JSON.stringify(doc).includes('registry'), false);
  assert.equal(JSON.stringify(doc).includes('screen'), false);
  assert.equal(mod.sent.some((message) => String(message.request).includes('consent')), false);
});

test('a camera that appears during a broadcast is published', () => {
  const mod = harness();
  mod.broadcast = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.noteBroadcastCamera(camera('registry-alice', 'alice', 'local', new FakeStream([track('video')])));
  mod.noteBroadcastCamera(camera('registry-bob', 'bob', 'remote', new FakeStream([track('video'), track('audio')])));
  assert.equal(mod.broadcast.outputs.length, 2);
  assert.equal(mod.broadcast.outputs[1].inputs[0], 'cam-2');
});

test('a participant leaving removes only their output', () => {
  const mod = harness();
  const pc = peerConnection();
  mod.peerManager.peers.set('viewer', pc);
  const alice = camera('registry-alice', 'alice', 'local', new FakeStream([track('video', 'a'), track('audio', 'a')]));
  const bob = camera('registry-bob', 'bob', 'remote', new FakeStream([track('video', 'b'), track('audio', 'b')]));
  mod.streams.entries.set(alice.id, alice);
  mod.streams.entries.set(bob.id, bob);
  mod.broadcast = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.publishCallCameras();
  mod.broadcast.viewers.set('viewer', { senders: [], lastMap: '' });
  mod.pushBroadcast();
  mod.listenForBroadcastChanges();
  mod.app.connection.emit('videocall-stream-removed', bob);
  assert.deepEqual(mod.broadcast.outputs.map((output) => output.id), ['cam-1']);
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
  mod.broadcast = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.publishCallCameras();
  mod.acceptBroadcastSubscribe('viewer', { publicationId: 'pub', outputIds: ['cam-1'] });
  const subscribed = mod.sent.filter((message) => message.request === 'video-call-swarmcast-subscribe');
  const bob = camera('registry-bob', 'bob', 'remote', new FakeStream([track('video', 'b'), track('audio', 'b')]));
  mod.streams.entries.set(bob.id, bob);
  mod.noteBroadcastCamera(bob);
  await Promise.resolve();
  const senders = mod.broadcast.viewers.get('viewer').senders;
  assert.deepEqual(
    senders.map((item) => item.outputId),
    ['cam-1', 'cam-1', 'cam-2', 'cam-2']
  );
  assert.equal(senders[0].sender, pc.transceivers[0].sender);
  const update = mod.sent.filter((message) => message.request === 'video-call-swarmcast-tracks').at(-1);
  assert.equal(update.data.publication.outputs.length, 2);
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
  mod.broadcast = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.broadcast.addCamera({ registryId: 'registry-alice', participant: 'alice', label: 'You' });
  const senders = [];
  syncSenders(pc, senders, mod.broadcast.outputs, (output) => mod.broadcast.streamFor(output, mod.streams));
  mod.broadcast.viewers.set('viewer', { senders, lastMap: '' });
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

test('publication termination tells viewers and does not stop call tracks', async () => {
  const mod = harness();
  const video = track('video');
  mod.broadcast = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.broadcast.viewers.set('viewer', { senders: [{ sender: { track: video } }], lastMap: '' });
  mod.peerManager.peers.set('viewer', { signalingState: 'stable' });
  mod._onBroadcastSignaling = () => {};
  mod._broadcastSources = new Set();
  mod.stopBroadcast();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mod.broadcast, null);
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
  mod.broadcast = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
  mod.broadcast.addCamera({ registryId: 'registry-alice', participant: 'alice', label: 'You' });
  const video = track('video');
  mod.streams.entries.set('registry-alice', {
    id: 'registry-alice',
    mediaStream: new FakeStream([video])
  });
  const senders = [];
  syncSenders(pc, senders, mod.broadcast.outputs, (output) => mod.broadcast.streamFor(output, mod.streams));
  mod.broadcast.viewers.set('viewer', { senders, lastMap: '' });
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
  assert.deepEqual(viewer.media.get('cam-1').getTracks(), [video, audio]);
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
  assert.deepEqual(viewer.media.get('cam-1').getTracks(), [video, audio]);
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
  mod.broadcast = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
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
  member.broadcast = new SwarmcastPublication({ id: 'pub', callId: 'room-1', broadcaster: 'alice' });
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
