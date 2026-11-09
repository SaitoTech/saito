const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const Swarmcast = require('./Swarmcast');
const { bindSwarmcastEvents, unbindSwarmcastEvents } = require('./events');

function fakePc(extra = {}) {
  const pc = {
    signalingState: 'stable',
    connectionState: 'new',
    iceConnectionState: 'new',
    dc: { readyState: 'connecting' },
    transceivers: [],
    addTrack(track) {
      const sender = { track, replaceTrack(next) { this.track = next; return Promise.resolve(); } };
      pc.transceivers.push({ sender, mid: String(pc.transceivers.length), direction: 'sendonly', stopped: false });
      return sender;
    },
    removeTrack() {},
    getTransceivers() {
      return pc.transceivers;
    },
    ...extra
  };
  return pc;
}

function node(key, { broadcaster = 'A', max_slots = 4 } = {}) {
  const mod = {
    publicKey: key,
    sent: [],
    app: { connection: new EventEmitter() },
    room_obj: { call_peers: [] },
    streams: { get() { return null; } },
    peerManager: {
      peers: new Map(),
      removed: [],
      hasConnectionWithPeer(id) {
        const pc = this.peers.get(id);
        return !!(pc && pc.connectionState === 'connected' && pc.dc?.readyState === 'open');
      },
      removePeerConnection(id) {
        this.removed.push(id);
        this.peers.delete(id);
      },
      sendJoinTransaction(id) {
        mod.joined = mod.joined || [];
        mod.joined.push(id);
        return Promise.resolve();
      },
      createPeerConnection(id, callback, answerOnly) {
        mod.connects.push({ id, answerOnly: !!answerOnly });
        const pc = fakePc();
        this.peers.set(id, pc);
        if (typeof callback === 'function') callback(id);
        return 1;
      }
    }
  };
  mod.connects = [];
  mod.sendSwarmcast = async (to, request, data) => {
    mod.sent.push({ to, request, data });
  };
  mod.peers = {
    connect(id, options = {}) {
      const answer = options.role === 'answer';
      return mod.peerManager.createPeerConnection(id, answer ? false : options.onReady, answer);
    }
  };
  const pub = new Swarmcast({ id: 'pub', callId: 'room-1', broadcaster, mod, max_slots });
  pub.mod = mod;
  return pub;
}

function wire(nodes) {
  const byKey = new Map(nodes.map((pub) => [pub.selfKey(), pub]));
  for (const pub of nodes) {
    pub.mod.sendSwarmcast = async (publicKey, request, data) => {
      pub.mod.sent.push({ to: publicKey, request, data });
      const target = byKey.get(publicKey);
      if (!target || pub.mod.drop?.has(publicKey)) return;
      if (request === 'video-call-swarmcast-join-request') {
        await target.onConnectionRequest(pub.selfKey(), data);
      } else if (request === 'video-call-swarmcast-join-response') {
        target.receiveJoinResponse(data);
      } else if (request === 'video-call-swarmcast-update') {
        target.receiveSwarmUpdate(data, pub.selfKey());
      } else if (request === 'video-call-swarmcast-subscribe') {
        target.acceptBroadcastSubscribe(pub.selfKey(), data);
      } else if (request === 'video-call-swarmcast-tracks') {
        target.receiveParentTracks(data);
      }
    };
  }
}

function requests(pub, request, to = '') {
  return pub.mod.sent.filter((item) => item.request === request && (!to || item.to === to));
}

function openChannel(pub, peerId) {
  const pc = pub.mod.peerManager.peers.get(peerId);
  if (!pc) return;
  pc.connectionState = 'connected';
  pc.iceConnectionState = 'connected';
  pc.dc.readyState = 'open';
}

test('a free provider reserves a pending slot and answers before the child is online', async () => {
  const provider = node('A');
  const viewer = node('E', { broadcaster: 'A' });
  wire([provider, viewer]);
  await viewer.joinNewParent('A');
  const child = provider.childFor('E');
  assert.equal(child.status, 'pending');
  assert.equal(child.link_state, 'reserved');
  assert.equal(provider.census().direct, 0);
  assert.equal(provider.census().admissions, 1);
  assert.equal(provider.census().available, 3);
  assert.equal(provider.mod.connects.filter((item) => item.answerOnly).length, 1);
  assert.equal(viewer.mod.connects.filter((item) => !item.answerOnly).length, 1);
  assert.equal(requests(provider, 'video-call-swarmcast-join-response')[0].data.state, 'ready');
  assert.equal(viewer.parent, 'A');
  assert.equal(viewer.parent_link, 'signalling');
  openChannel(provider, 'E');
  provider.onChildLink('E', 'channel');
  assert.equal(provider.childFor('E').status, 'online');
  assert.equal(provider.childFor('E').link_state, 'channel');
  const snapshot = requests(provider, 'video-call-swarmcast-update').find((item) => item.data.direction === 'down');
  assert.equal(snapshot.data.admission, false);
  assert.equal(snapshot.data.children.filter(Boolean).length, 1);
  assert.equal(viewer.depth, 1);
  assert.equal(viewer.grandparent, '');
  assert.equal(viewer.tree_path, 'A/E');
  provider.releaseTimers();
  viewer.releaseTimers();
});

test('duplicate join requests reuse the pending slot', async () => {
  const provider = node('A');
  await provider.onConnectionRequest('E', { publicationId: 'pub' });
  await provider.onConnectionRequest('E', { publicationId: 'pub' });
  assert.equal(provider.mod.connects.length, 1);
  assert.equal(provider.children.filter(Boolean).length, 1);
  assert.equal(requests(provider, 'video-call-swarmcast-join-response').length, 2);
  assert.equal(provider.childFor('E').status, 'pending');
  provider.releaseTimers();
});

test('an abandoned admission releases its slot and a later attempt can use it', async () => {
  jest.useFakeTimers();
  try {
    const provider = node('A');
    await provider.onConnectionRequest('E', { publicationId: 'pub' });
    assert.equal(provider.childFor('E').status, 'pending');
    jest.advanceTimersByTime(20000);
    assert.equal(provider.childFor('E'), null);
    assert.equal(provider.mod.peerManager.removed.includes('E'), true);
    provider.onChildReconnected('E');
    assert.equal(provider.childFor('E'), null);
    await provider.onConnectionRequest('E', { publicationId: 'pub' });
    assert.equal(provider.childFor('E').status, 'pending');
  } finally {
    jest.useRealTimers();
  }
});

test('a provider that is full returns one real candidate and the requester joins that candidate', async () => {
  const origin = node('A', { max_slots: 1 });
  const relay = node('B', { broadcaster: 'A' });
  const viewer = node('E', { broadcaster: 'A' });
  wire([origin, relay, viewer]);
  origin.addChild('B');
  origin.childFor('B').free_slots = 2;
  viewer.mod.connects = [];
  await viewer.joinNewParent('A');
  const refusal = requests(origin, 'video-call-swarmcast-join-response', 'E')[0];
  assert.equal(refusal.data.state, 'unavailable');
  assert.equal(refusal.data.candidate, 'B');
  assert.equal(origin.mod.connects.some((item) => item.id === 'E'), false);
  assert.equal(viewer.pending_parent, 'B');
  assert.equal(relay.childFor('E').status, 'pending');
  assert.equal(viewer.mod.connects.some((item) => item.id === 'A'), false);
  assert.equal(viewer.mod.connects.some((item) => item.id === 'B' && !item.answerOnly), true);
  origin.releaseTimers();
  relay.releaseTimers();
  viewer.releaseTimers();
});

test('a known-full first candidate is skipped for a later candidate with room', async () => {
  const origin = node('A', { max_slots: 2 });
  const full = node('B', { broadcaster: 'A', max_slots: 1 });
  const open = node('D', { broadcaster: 'A' });
  const viewer = node('E', { broadcaster: 'A' });
  wire([origin, full, open, viewer]);
  origin.addChild('B');
  origin.childFor('B').free_slots = 0;
  origin.addChild('D');
  origin.childFor('D').free_slots = 1;
  full.addChild('taken');
  await viewer.joinNewParent('A');
  assert.equal(requests(origin, 'video-call-swarmcast-join-response')[0].data.candidate, 'D');
  assert.equal(viewer.pending_parent, 'D');
  assert.equal(full.childFor('E'), null);
  assert.equal(open.childFor('E').status, 'pending');
  for (const pub of [origin, full, open, viewer]) pub.releaseTimers();
});

test('unknown capacity is only a fallback and a refused candidate is not retried', async () => {
  const origin = node('A', { max_slots: 1 });
  const unknown = node('B', { broadcaster: 'A', max_slots: 0 });
  const viewer = node('E', { broadcaster: 'A' });
  wire([origin, unknown, viewer]);
  origin.addChild('B');
  assert.equal(origin.childFor('B').free_slots, null);
  await viewer.joinNewParent('A');
  const tried = viewer.mod.sent.filter((item) => item.request === 'video-call-swarmcast-join-request').map((item) => item.to);
  assert.deepEqual(tried, ['A', 'B']);
  assert.equal(viewer.recovering, false);
  assert.equal(viewer.pending_parent, '');
  for (const pub of [origin, unknown, viewer]) pub.releaseTimers();
});

test('a candidate that never answers is abandoned for the next one', async () => {
  jest.useFakeTimers();
  try {
    const viewer = node('E', { broadcaster: 'A' });
    const next = node('D', { broadcaster: 'A' });
    wire([viewer, next]);
    viewer.mod.drop = new Set(['B']);
    viewer.recovery_targets = ['D'];
    await viewer.joinNewParent('B');
    assert.equal(viewer.pending_parent, 'B');
    assert.equal(next.childFor('E'), null);
    jest.advanceTimersByTime(20000);
    await Promise.resolve();
    assert.equal(viewer.pending_parent, 'D');
    assert.equal(next.childFor('E').status, 'pending');
    viewer.releaseTimers();
    next.releaseTimers();
  } finally {
    jest.useRealTimers();
  }
});

test('a four-tier tree receives parent, grandparent, depth, path, and sibling slots', async () => {
  const pubs = ['A', 'B', 'C', 'D', 'E'].map((key) => node(key, { broadcaster: 'A' }));
  wire(pubs);
  const [source, first, second, third, leaf] = pubs;
  for (const pub of [first, second, third, leaf]) {
    const parent = pubs[pubs.indexOf(pub) - 1];
    await pub.joinNewParent(parent.selfKey());
    openChannel(parent, pub.selfKey());
    parent.onChildLink(pub.selfKey(), 'channel');
  }
  assert.equal(first.depth, 1);
  assert.equal(first.grandparent, '');
  assert.equal(first.tree_path, 'A/B');
  assert.equal(second.depth, 2);
  assert.equal(second.grandparent, 'A');
  assert.equal(second.tree_path, 'A/B/C');
  assert.equal(third.depth, 3);
  assert.equal(third.grandparent, 'B');
  assert.equal(third.tree_path, 'A/B/C/D');
  assert.equal(third.siblings[0].public_key, 'D');
  assert.equal(leaf.depth, 4);
  assert.equal(leaf.parent, 'D');
  assert.equal(leaf.grandparent, 'C');
  assert.equal(leaf.tree_path, 'A/B/C/D/E');
  assert.equal(source.childFor('B').status, 'online');
  for (const pub of pubs) pub.releaseTimers();
});

test('slot zero rejoins the grandparent and the next sibling waits, then follows', async () => {
  jest.useFakeTimers();
  try {
    const grandparent = node('B', { broadcaster: 'A' });
    const first = node('D', { broadcaster: 'A' });
    const second = node('F', { broadcaster: 'A' });
    wire([grandparent, first, second]);
    for (const pub of [first, second]) {
      pub.parent = 'C';
      pub.grandparent = 'B';
      pub.depth = 3;
      pub.parent_status = 'online';
      pub.siblings = [
        { public_key: 'D', status: 'online', free_slots: null },
        { public_key: 'F', status: 'online', free_slots: null }
      ];
    }
    first.onParentDisconnected('C');
    second.onParentDisconnected('C');
    assert.equal(requests(first, 'video-call-swarmcast-join-request')[0].to, 'B');
    assert.equal(requests(second, 'video-call-swarmcast-join-request').length, 0);
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    assert.equal(requests(second, 'video-call-swarmcast-join-request')[0].to, 'D');
    assert.equal(grandparent.childFor('D').status, 'pending');
    for (const pub of [grandparent, first, second]) pub.releaseTimers();
  } finally {
    jest.useRealTimers();
  }
});

test('a leaf with an open viewer still starts recovery', async () => {
  const leaf = node('E', { broadcaster: 'A' });
  leaf.mod.swarmcastView = { closed: false, phase: 'playing' };
  leaf.parent = 'D';
  leaf.grandparent = 'C';
  leaf.depth = 4;
  leaf.parent_status = 'online';
  leaf.siblings = [{ public_key: 'E', status: 'online' }];
  leaf.onParentDisconnected('D');
  assert.equal(requests(leaf, 'video-call-swarmcast-join-request')[0].to, 'C');
  assert.equal(leaf.recovering, true);
  leaf.releaseTimers();
});

test('a full grandparent is refused and the broadcaster is tried next', async () => {
  const origin = node('A');
  const grandparent = node('B', { broadcaster: 'A', max_slots: 1 });
  const child = node('D', { broadcaster: 'A' });
  wire([origin, grandparent, child]);
  grandparent.addChild('C');
  grandparent.childFor('C').free_slots = 0;
  child.parent = 'C';
  child.grandparent = 'B';
  child.depth = 3;
  child.parent_status = 'online';
  child.siblings = [{ public_key: 'D', status: 'online' }];
  child.onParentDisconnected('C');
  assert.equal(child.pending_parent, 'A');
  assert.equal(origin.childFor('D').status, 'pending');
  assert.equal(grandparent.childFor('D'), null);
  for (const pub of [origin, grandparent, child]) pub.releaseTimers();
});

test('a late event from the old parent does not cancel the replacement attempt', async () => {
  const replacement = node('B', { broadcaster: 'A' });
  const child = node('D', { broadcaster: 'A' });
  wire([replacement, child]);
  child.parent = 'C';
  child.grandparent = 'B';
  child.depth = 3;
  child.parent_status = 'online';
  child.siblings = [{ public_key: 'D', status: 'online' }];
  child.onParentDisconnected('C');
  assert.equal(child.pending_parent, 'B');
  child.tree_path = 'A/B/C/D';
  child.receiveSwarmUpdate({
    direction: 'down',
    publicationId: 'pub',
    public_key: 'C',
    parent: 'Z',
    tree_path: 'Z/C',
    depth: 1,
    children: []
  }, 'C');
  assert.equal(child.tree_path, 'A/B/C/D');
  assert.equal(child.grandparent, 'B');
  child.onParentLink('C', 'channel');
  child.onParentReconnected('C');
  assert.equal(child.pending_parent, 'B');
  assert.equal(child.recovering, true);
  assert.equal(child.parent, 'C');
  replacement.releaseTimers();
  child.releaseTimers();
});

test('connection failure waits and then recovers, and a restored channel cancels that wait', async () => {
  jest.useFakeTimers();
  try {
    const child = node('D', { broadcaster: 'A' });
    child.mod.swarmcast = child;
    bindSwarmcastEvents(child);
    child.parent = 'C';
    child.pending_parent = 'C';
    child.grandparent = 'B';
    child.depth = 3;
    child.parent_status = 'online';
    child.siblings = [{ public_key: 'D', status: 'online' }];
    child.mod.app.connection.emit('stun-update-connection-message', 'C', 'failed');
    assert.equal(requests(child, 'video-call-swarmcast-join-request').length, 0);
    jest.advanceTimersByTime(4999);
    assert.equal(requests(child, 'video-call-swarmcast-join-request').length, 0);
    jest.advanceTimersByTime(1);
    assert.equal(requests(child, 'video-call-swarmcast-join-request')[0].to, 'B');

    const restored = node('E', { broadcaster: 'A' });
    restored.mod.swarmcast = restored;
    bindSwarmcastEvents(restored);
    restored.parent = 'C';
    restored.pending_parent = 'C';
    restored.depth = 2;
    restored.grandparent = 'A';
    restored.parent_status = 'online';
    restored.mod.peerManager.peers.set('C', fakePc({ connectionState: 'connected', iceConnectionState: 'connected', dc: { readyState: 'open' } }));
    restored.mod.app.connection.emit('stun-update-connection-message', 'C', 'disconnected');
    jest.advanceTimersByTime(5000);
    assert.equal(requests(restored, 'video-call-swarmcast-join-request').length, 0);
    unbindSwarmcastEvents(child);
    unbindSwarmcastEvents(restored);
  } finally {
    jest.useRealTimers();
  }
});

test('replacement subscribes, clears old mids, and forwards the new track map downstream', async () => {
  const parent = node('B', { broadcaster: 'A' });
  const relay = node('D', { broadcaster: 'A' });
  const leaf = node('E', { broadcaster: 'A' });
  wire([parent, relay, leaf]);
  parent.inputs = [{ id: 'cam-1', kind: 'camera', registryId: 'reg' }];
  parent.outputs = [{ id: 'cam-1', role: 'video', kind: 'camera', label: 'A', inputs: ['cam-1'] }];
  parent.mod.streams.get = (id) => (id === 'reg' ? {
    mediaStream: { getTracks: () => [{ kind: 'video', id: 'new-track', readyState: 'live', addEventListener() {} }] }
  } : null);
  relay.inputs = parent.inputs.map((input) => ({ ...input }));
  relay.outputs = parent.outputs.map((output) => ({ ...output, inputs: output.inputs.slice() }));
  relay.mod.swarmcastView = { closed: false, phase: 'playing' };
  relay.parent_mids = new Map([['cam-1', [{ mid: '9', kind: 'video' }]]]);
  relay.parent = 'C';
  relay.grandparent = 'B';
  relay.depth = 3;
  relay.parent_status = 'online';
  relay.parent_link = 'forwarding';
  relay.siblings = [{ public_key: 'D', status: 'online' }];
  relay.addChild('E');
  const leafPc = fakePc();
  relay.mod.peerManager.peers.set('E', leafPc);
  relay.onParentDisconnected('C');
  openChannel(parent, 'D');
  parent.onChildLink('D', 'channel');
  openChannel(relay, 'B');
  relay.onParentLink('B', 'channel');
  assert.equal(relay.parent, 'B');
  assert.equal(relay.parent_mids.size, 0);
  assert.equal(requests(relay, 'video-call-swarmcast-subscribe', 'B').length, 1);
  assert.equal(relay.mod.peerManager.removed.includes('C'), true);
  assert.equal(relay.mod.peerManager.peers.has('B'), true);
  const tracks = requests(parent, 'video-call-swarmcast-tracks', 'D').filter((item) => item.data.outputs?.length);
  assert.equal(tracks.length > 0, true);
  assert.equal(tracks.at(-1).data.outputs[0].mids[0].mid, '0');
  assert.notEqual(tracks.at(-1).data.outputs[0].mids[0].mid, '9');
  const parentPc = relay.mod.peerManager.peers.get('B');
  parentPc.getTransceivers = () => [{
    mid: '0',
    receiver: { track: { kind: 'video', readyState: 'live', id: 'forwarded' } }
  }];
  relay.receiveParentTracks(tracks.at(-1).data);
  const downstream = requests(relay, 'video-call-swarmcast-tracks', 'E');
  assert.equal(downstream.length > 0, true);
  assert.equal(downstream.at(-1).data.outputs[0].mids[0].mid, '0');
  assert.equal(relay.media_forwarded, true);
  assert.equal(relay.parent_link, 'forwarding');
  for (const pub of [parent, relay, leaf]) pub.releaseTimers();
});

test('an upward report does not revive a disconnected child or treat unknown capacity as free', () => {
  const provider = node('A');
  provider.addChild('B');
  provider.onChildDisconnected('B');
  provider.receiveSwarmUpdate({
    direction: 'up',
    publicationId: 'pub',
    status: 'online',
    free_slots: null,
    downstream: 1,
    downstream_known: true,
    children: []
  }, 'B');
  assert.equal(provider.childFor('B').status, 'disconnected');
  assert.equal(provider.childFor('B').free_slots, null);
  assert.equal(provider.candidateIndex(), -1);
  provider.childFor('B').status = 'online';
  provider.childFor('B').free_slots = null;
  provider.addChild('D');
  provider.childFor('D').free_slots = 1;
  assert.equal(provider.candidateIndex(), 1);
  provider.releaseTimers();
});
