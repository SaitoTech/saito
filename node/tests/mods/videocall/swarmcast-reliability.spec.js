const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const Swarmcast = require('../../../mods/videocall/lib/swarmcast/Swarmcast');
const { bindSwarmcastEvents, unbindSwarmcastEvents } = require('../../../mods/videocall/lib/swarmcast/events');

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
        target.receiveParentTracks(data, pub.selfKey());
      } else if (request === 'video-call-swarmcast-parent-available') {
        target.receiveParentAvailable(data, pub.selfKey());
      } else if (request === 'video-call-swarmcast-parent-leaving') {
        target.receiveParentLeaving(data, pub.selfKey());
      } else if (request === 'video-call-swarmcast-ended') {
        target.receivePublicationEnded(data);
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
  const carried = relay.parent_mids.get('cam-1') || [];
  assert.notEqual(carried[0]?.mid, '9');
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

function liveFeed(pub, parent, depth) {
  pub.parent = parent;
  pub.pending_parent = parent;
  pub.depth = depth;
  pub.parent_status = 'online';
  pub.parent_link = 'forwarding';
  pub.parent_mids = new Map([['cam', [{ mid: '1', kind: 'video' }]]]);
  pub.noteUpstream(parent, { depth, usable: true, link: 'forwarding', mids: pub.parent_mids });
}

test('a returning parent is joined without dropping the live feed, then adopted when it is closer', async () => {
  const child = node('D', { broadcaster: 'A' });
  const returned = node('B', { broadcaster: 'A' });
  wire([child, returned]);
  liveFeed(child, 'C', 4);
  child.mod.peerManager.peers.set('C', fakePc({ connectionState: 'connected', iceConnectionState: 'connected', dc: { readyState: 'open' } }));
  returned.depth = 1;
  returned.tree_path = 'A/B';
  returned.parent = 'A';
  returned.parent_link = 'forwarding';
  returned.parent_mids = new Map([['cam', [{ mid: '1', kind: 'video' }]]]);
  returned.former_children = ['D'];
  returned.notifyFormerChildren();
  assert.equal(requests(returned, 'video-call-swarmcast-parent-available', 'D').length, 1);
  assert.equal(requests(child, 'video-call-swarmcast-join-request', 'B').length, 1);
  assert.equal(child.parent, 'C');
  assert.equal(child.parent_mids.get('cam')[0].mid, '1');
  openChannel(returned, 'D');
  returned.onChildLink('D', 'channel');
  openChannel(child, 'B');
  child.onParentLink('B', 'channel');
  assert.equal(child.parent, 'C');
  assert.equal(child.mod.peerManager.removed.includes('C'), false);
  const pc = child.mod.peerManager.peers.get('B');
  pc.getTransceivers = () => [{ mid: '7', receiver: { track: { kind: 'video', readyState: 'live', id: 'b' } } }];
  child.receiveParentTracks({ publicationId: 'pub', outputs: [{ id: 'cam', mids: [{ mid: '7', kind: 'video' }] }] }, 'B');
  assert.equal(child.parent, 'B');
  assert.equal(child.depth, 2);
  assert.equal(child.mod.peerManager.removed.includes('C'), true);
  child.releaseTimers();
  returned.releaseTimers();
});

test('a second upstream update does not replace the active topology', () => {
  const child = node('D', { broadcaster: 'A' });
  liveFeed(child, 'C', 3);
  child.tree_path = 'A/C/D';
  child.pending_parent = 'B';
  child.receiveSwarmUpdate({
    direction: 'down',
    publicationId: 'pub',
    public_key: 'B',
    parent: 'A',
    tree_path: 'A/B',
    depth: 1,
    children: [{ public_key: 'Z' }]
  }, 'B');
  assert.equal(child.tree_path, 'A/C/D');
  assert.equal(child.parent, 'C');
  assert.equal(child.upstreams.get('B').depth, 2);
  assert.equal(child.upstreams.get('B').tree_path, 'A/B');
  child.releaseTimers();
});

test('a returning parent is ignored when it is not closer than the live parent', () => {
  const child = node('D', { broadcaster: 'A' });
  liveFeed(child, 'C', 2);
  child.receiveParentAvailable({
    publicationId: 'pub',
    broadcaster: 'A',
    tree_path: 'A/B',
    depth: 2,
    free_slots: 2
  }, 'B');
  assert.equal(child.mod.sent.length, 0);
  assert.equal(child.parent, 'C');
  child.releaseTimers();
});

test('a candidate that never produces tracks leaves the live parent in place', () => {
  const child = node('D', { broadcaster: 'A' });
  liveFeed(child, 'C', 3);
  child.attempt_token = 1;
  child.pending_parent = 'B';
  child.recovering = true;
  child.receiveJoinResponse({ state: 'unavailable', contact: 'B', reason: 'full' });
  assert.equal(child.parent, 'C');
  assert.equal(child.parent_link, 'forwarding');
  assert.equal(child.parent_mids.size, 1);
  assert.equal(child.recovering, false);
  child.releaseTimers();
});

test('a parent with no free slots is not joined while the current feed is live', () => {
  const child = node('D', { broadcaster: 'A' });
  liveFeed(child, 'C', 4);
  child.receiveParentAvailable({
    publicationId: 'pub',
    broadcaster: 'A',
    depth: 1,
    free_slots: 0,
    tree_path: 'A/B'
  }, 'B');
  assert.equal(requests(child, 'video-call-swarmcast-join-request').length, 0);
  assert.equal(child.parent, 'C');
  child.releaseTimers();
});

test('a missed return notice leaves the child on its current parent', () => {
  const child = node('D', { broadcaster: 'A' });
  liveFeed(child, 'C', 3);
  assert.equal(child.id, 'pub');
  assert.equal(child.parent, 'C');
  assert.equal(child.mod.sent.length, 0);
  child.releaseTimers();
});

test('an intermediate departure notifies children and is not a publication end', async () => {
  const parent = node('B', { broadcaster: 'A' });
  parent.addChild('D');
  parent.former_children = ['D', 'E'];
  const notice = await parent.announceDeparture();
  assert.equal(notice.root, false);
  assert.equal(notice.request, 'video-call-swarmcast-parent-leaving');
  assert.equal(requests(parent, 'video-call-swarmcast-ended').length, 0);
  assert.equal(requests(parent, 'video-call-swarmcast-parent-leaving').map((item) => item.to).sort().join(','), 'D,E');
  parent.releaseTimers();
});

test('a leaving parent keeps the child feed up while the child looks elsewhere', () => {
  const child = node('D', { broadcaster: 'A' });
  const origin = node('A');
  wire([child, origin]);
  liveFeed(child, 'B', 2);
  child.grandparent = 'A';
  child.siblings = [{ public_key: 'D', status: 'online', free_slots: 1 }];
  child.receiveParentLeaving({ publicationId: 'pub', broadcaster: 'A' }, 'B');
  assert.equal(child.parent, 'B');
  assert.equal(child.parent_link, 'forwarding');
  assert.equal(requests(child, 'video-call-swarmcast-join-request')[0].to, 'A');
  assert.equal(requests(child, 'video-call-swarmcast-ended').length, 0);
  child.releaseTimers();
  origin.releaseTimers();
});

test('the broadcaster ending the publication tells current and former children', async () => {
  const origin = node('A');
  origin.addChild('B');
  origin.former_children = ['B', 'D'];
  const notice = await origin.announceDeparture();
  assert.equal(notice.root, true);
  assert.equal(notice.request, 'video-call-swarmcast-ended');
  const relay = node('B', { broadcaster: 'A' });
  relay.addChild('D');
  wire([origin, relay]);
  relay.receivePublicationEnded({ publicationId: 'pub', callId: 'room-1', broadcaster: 'A' });
  assert.equal(requests(relay, 'video-call-swarmcast-ended', 'D').length, 1);
  assert.equal(relay.ended, true);
  origin.releaseTimers();
  relay.releaseTimers();
});

test('departure waits a bounded grace and then clears the publication even if nobody answers', async () => {
  jest.useFakeTimers();
  const previous = global.document;
  const lines = [];
  global.document = {
    querySelector() {
      return null;
    },
    createElement() {
      const node = { className: '', innerHTML: '', text: '' };
      node.querySelector = () => ({
        set textContent(value) {
          node.text = value;
          lines.push(value);
        }
      });
      return node;
    },
    body: { appendChild() {} }
  };
  try {
    const { Swarmcasts } = require('../../../mods/videocall/lib/swarmcast');
    const parent = node('B', { broadcaster: 'A' });
    parent.addChild('D');
    parent.mod.swarmcast = parent;
    const casts = new Swarmcasts(parent.mod);
    const finished = casts.depart();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(requests(parent, 'video-call-swarmcast-parent-leaving', 'D').length, 1);
    assert.equal(requests(parent, 'video-call-swarmcast-ended').length, 0);
    assert.equal(parent.mod.swarmcast, parent);
    for (let step = 0; step < Swarmcast.DEPARTURE_GRACE; step += 400) {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
    }
    await finished;
    assert.equal(parent.mod.swarmcast, null);
    assert.equal(requests(parent, 'video-call-swarmcast-ended').length, 0);
    assert.deepEqual(lines, [
      'Notifying peers…',
      'Notifying children…',
      'Allowing the network to rebalance…',
      'Exiting…'
    ]);
  } finally {
    global.document = previous;
    jest.useRealTimers();
  }
});

test('refresh restores the same publication instead of minting a new one', () => {
  const { restorePublication } = require('../../../mods/videocall/lib/swarmcast');
  const mod = { publicKey: 'B', recoveryTabId: () => 'tab-1' };
  const pub = restorePublication(mod, {
    status: 'live',
    publication_id: 'same-id',
    call_id: 'room-1',
    broadcaster: 'A',
    show: 'participants',
    active_parent: 'A',
    former_children: ['D'],
    owner: 'tab-1',
    heartbeat: Date.now()
  });
  assert.equal(pub.id, 'same-id');
  assert.equal(pub.parent, 'A');
  assert.deepEqual(pub.former_children, ['D']);
  assert.equal(mod.swarmcastNeedsResume, false);
  pub.releaseTimers();
});

test('screen capture restore asks for resume instead of recapturing by itself', () => {
  const { restorePublication } = require('../../../mods/videocall/lib/swarmcast');
  const mod = { publicKey: 'A', recoveryTabId: () => 'tab-1' };
  const pub = restorePublication(mod, {
    status: 'live',
    publication_id: 'same-id',
    call_id: 'room-1',
    broadcaster: 'A',
    show: 'interface',
    owner: 'tab-1',
    heartbeat: Date.now()
  });
  assert.equal(mod.swarmcastNeedsResume, true);
  assert.equal(pub.id, 'same-id');
  pub.releaseTimers();
});

test('call membership does not block a swarmcast join', async () => {
  const provider = node('B', { broadcaster: 'A' });
  provider.mod.room_obj.call_peers = ['D'];
  await provider.onConnectionRequest('D', { publicationId: 'pub', callId: 'room-1' });
  assert.equal(provider.childFor('D').status, 'pending');
  assert.equal(requests(provider, 'video-call-swarmcast-join-response')[0].data.state, 'ready');
  const pc = fakePc();
  provider.mod.peerManager.peers.set('D', pc);
  provider.acceptBroadcastSubscribe('D', { publicationId: 'pub', outputIds: [] });
  assert.equal(provider.childFor('D').link_state, 'subscribed');
  provider.releaseTimers();
});

test('a second tab does not restore a publication the first tab still owns', () => {
  const { recoveryBlocked, restorePublication } = require('../../../mods/videocall/lib/swarmcast');
  const record = {
    status: 'live',
    publication_id: 'same-id',
    owner: 'tab-1',
    heartbeat: Date.now(),
    broadcaster: 'A',
    call_id: 'room-1'
  };
  assert.equal(recoveryBlocked(record, 'tab-2'), true);
  assert.equal(recoveryBlocked(record, 'tab-1'), false);
  const mod = { publicKey: 'D', recoveryTabId: () => 'tab-2' };
  assert.equal(restorePublication(mod, record), null);
  assert.equal(mod.swarmcast, undefined);
});

test('a join that would cycle is refused', async () => {
  const provider = node('B', { broadcaster: 'A' });
  provider.tree_path = 'A/D/B';
  await provider.onConnectionRequest('D', { publicationId: 'pub', tree_path: 'A/D' });
  assert.equal(provider.childFor('D'), null);
  assert.equal(requests(provider, 'video-call-swarmcast-join-response')[0].data.reason, 'cycle');
  provider.releaseTimers();
});

test('a standby upstream stays connected without a second media subscription', () => {
  const child = node('D', { broadcaster: 'A' });
  const standby = node('B', { broadcaster: 'A' });
  wire([child, standby]);
  liveFeed(child, 'C', 3);
  child.tree_path = 'A/C/D';
  child.mod.peerManager.peers.set('C', fakePc({ connectionState: 'connected', iceConnectionState: 'connected', dc: { readyState: 'open' } }));
  child.mod.peerManager.peers.set('B', fakePc({ connectionState: 'connected', iceConnectionState: 'connected', dc: { readyState: 'open' } }));
  child.pending_parent = 'B';
  child.recovering = true;
  standby.addChild('D', 'pending');
  const standbyChild = standby.childFor('D');
  standbyChild.status = 'online';
  standbyChild.link_state = 'channel';
  child.onParentLink('B', 'channel');
  assert.equal(requests(child, 'video-call-swarmcast-subscribe', 'B').length, 0);
  assert.equal(requests(standby, 'video-call-swarmcast-tracks', 'D').length, 0);
  assert.equal(child.parent, 'C');
  assert.equal(standby.childFor('D').status, 'online');

  child.receiveSwarmUpdate({
    direction: 'down',
    publicationId: 'pub',
    public_key: 'B',
    parent: 'A',
    tree_path: 'A/B',
    depth: 1,
    children: []
  }, 'B');
  assert.equal(requests(child, 'video-call-swarmcast-subscribe', 'B').length, 1);
  assert.equal(child.parent, 'C');
  assert.equal(child.mod.peerManager.removed.includes('C'), false);
  const pc = child.mod.peerManager.peers.get('B');
  pc.getTransceivers = () => [{ mid: '7', receiver: { track: { kind: 'video', readyState: 'live', id: 'b' } } }];
  child.receiveParentTracks({ publicationId: 'pub', outputs: [{ id: 'cam', mids: [{ mid: '7', kind: 'video' }] }] }, 'B');
  assert.equal(child.parent, 'B');
  assert.equal(child.mod.peerManager.removed.includes('C'), true);
  child.releaseTimers();
  standby.releaseTimers();
});

test('a failed active parent starts media on the connected standby without a new join', () => {
  const child = node('D', { broadcaster: 'A' });
  const standby = node('B', { broadcaster: 'A' });
  wire([child, standby]);
  liveFeed(child, 'C', 3);
  child.pending_parent = 'B';
  child.recovering = true;
  child.noteUpstream('B', { link: 'channel', depth: 2 });
  child.mod.peerManager.peers.set('B', fakePc({ connectionState: 'connected', iceConnectionState: 'connected', dc: { readyState: 'open' } }));
  standby.addChild('D', 'pending');
  child.onParentDisconnected('C');
  assert.equal(requests(child, 'video-call-swarmcast-join-request').length, 0);
  assert.equal(requests(child, 'video-call-swarmcast-subscribe', 'B').length, 1);
  assert.equal(child.parent, 'C');
  const pc = child.mod.peerManager.peers.get('B');
  pc.getTransceivers = () => [{ mid: '4', receiver: { track: { kind: 'video', readyState: 'live', id: 'b' } } }];
  child.receiveParentTracks({ publicationId: 'pub', outputs: [{ id: 'cam', mids: [{ mid: '4', kind: 'video' }] }] }, 'B');
  assert.equal(child.parent, 'B');
  child.releaseTimers();
  standby.releaseTimers();
});
