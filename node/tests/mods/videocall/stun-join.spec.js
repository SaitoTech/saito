class FakePeerConnection {
  constructor() {
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.iceGatheringState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
    this.operations = [];
    this.ice = [];
    this.remoteEntered = 0;
  }

  addEventListener() {}

  createDataChannel() {
    return {};
  }

  async setRemoteDescription(description) {
    this.operations.push(`remote-${description.type}`);
    this.remoteEntered += 1;
    if (this.holdRemote) await this.holdRemote;
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    this.onsignalingstatechange?.();
  }

  async setLocalDescription(description) {
    if (description?.type === 'rollback') {
      this.operations.push('rollback');
      if (this.signalingState === 'stable') {
        const error = new Error('Cannot rollback from stable');
        error.name = 'InvalidStateError';
        throw error;
      }
      this.localDescription = null;
      this.signalingState = 'stable';
      this.onsignalingstatechange?.();
      return;
    }

    if (this.signalingState === 'have-remote-offer') {
      this.operations.push('local-answer');
      this.localDescription = { type: 'answer', sdp: 'answer' };
      this.signalingState = 'stable';
      this.onsignalingstatechange?.();
      return;
    }

    this.operations.push('local-offer');
    this.localDescription = { type: 'offer', sdp: 'local-offer' };
    this.signalingState = 'have-local-offer';
    this.onsignalingstatechange?.();
    if (this.rollbackBeforeSettle) {
      this.operations.push('rollback');
      this.localDescription = null;
      this.signalingState = 'stable';
      this.onsignalingstatechange?.();
    }
  }

  async addIceCandidate(candidate) {
    this.ice.push(candidate);
    this.candidate = candidate;
  }

  restartIce() {
    this.restartCount = (this.restartCount || 0) + 1;
    this.onnegotiationneeded?.();
  }

  close() {
    this.connectionState = 'closed';
    this.signalingState = 'closed';
  }
}

global.RTCPeerConnection = FakePeerConnection;
global.siteMessage = () => {};
global.sconfirm = async () => false;

const Stun = require('../../../mods/stun/stun.js');

function emitter() {
  const handlers = {};
  return {
    on(event, handler) {
      handlers[event] = handlers[event] || [];
      handlers[event].push(handler);
    },
    emit(event, ...args) {
      (handlers[event] || []).forEach((handler) => handler(...args));
    }
  };
}

function stun() {
  const connection = emitter();
  const sent = [];
  const app = {
    connection,
    wallet: {
      async createUnsignedTransactionWithDefaultFee() {
        return {
          msg: {},
          async sign() {}
        };
      }
    },
    network: {
      propagateTransaction(tx) {
        sent.push(tx);
      }
    },
    keychain: { returnUsername: (key) => key },
    options: {}
  };
  const mod = new Stun(app);
  mod.publicKey = 'aaaaaaaa';
  return { mod, sent };
}

const POLITE = 'bbbbbbbb';
const IMPOLITE = '00000000';

function sdp(ufrag) {
  return `v=0\r\na=ice-ufrag:${ufrag}\r\n`;
}

function offer(ufrag) {
  return { description: { type: 'offer', sdp: sdp(ufrag) } };
}

function answer(ufrag) {
  return { description: { type: 'answer', sdp: sdp(ufrag) } };
}

function candidate(fragment, id = fragment || 'bare') {
  const iceCandidate = { candidate: `candidate:${id}`, sdpMid: '0' };
  if (fragment) iceCandidate.usernameFragment = fragment;
  return { iceCandidate };
}

function sentDescriptions(sent) {
  return sent.map((tx) => tx.msg).filter((msg) => msg.request === 'peer-description');
}

function defer() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function tick() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('mesh signaling when a third participant joins', () => {
  test('an offer that arrives before the peer connection is applied after it is created', async () => {
    const { mod } = stun();
    const remote = 'bbbbbbbb';
    await mod.handleSignalingMessage(remote, 'peer-description', {
      description: { type: 'offer', sdp: 'v=0' }
    });
    expect(mod.peers.has(remote)).toBe(false);

    mod.createPeerConnection(remote, false);
    await new Promise((resolve) => setImmediate(resolve));

    const pc = mod.peers.get(remote);
    expect(pc.remoteDescription).toEqual({ type: 'offer', sdp: 'v=0' });
    expect(pc.localDescription.type).toBe('answer');
  });

  test('a negotiation that starts while signaling is busy runs once it is stable', async () => {
    const { mod } = stun();
    const remote = 'bbbbbbbb';
    mod.createPeerConnection(remote, false);
    const pc = mod.peers.get(remote);
    pc.signalingState = 'have-local-offer';
    pc.onnegotiationneeded();
    expect(pc.negotiateAgain).toBe(true);
    expect(pc.localDescription).toBeNull();

    pc.signalingState = 'stable';
    pc.onsignalingstatechange();
    await new Promise((resolve) => setImmediate(resolve));

    expect(pc.negotiateAgain).toBe(false);
    expect(pc.localDescription.type).toBe('offer');
  });
});

describe('SDP offer collision', () => {
  test('a polite peer rolls back its offer, accepts the remote offer, and sends an answer', async () => {
    const { mod, sent } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);
    pc.signalingState = 'have-local-offer';
    pc.localDescription = { type: 'offer', sdp: 'local-offer' };

    await mod.handleSignalingMessage(POLITE, 'peer-description', offer('A2'));

    expect(pc.operations.slice(0, 3)).toEqual(['rollback', 'remote-offer', 'local-answer']);
    expect(pc.remoteDescription.sdp).toContain('a=ice-ufrag:A2');
    expect(pc.signalingState).toBe('stable');
    expect(sentDescriptions(sent).map((msg) => msg.description.type)).toEqual(['answer']);
    expect(pc.rude).toBeUndefined();
  });

  test('an impolite peer ignores a colliding offer and keeps its local offer', async () => {
    const { mod, sent } = stun();
    mod.createPeerConnection(IMPOLITE, false);
    const pc = mod.peers.get(IMPOLITE);
    pc.signalingState = 'have-local-offer';
    pc.localDescription = { type: 'offer', sdp: sdp('local') };

    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', offer('A1'));

    expect(pc.remoteDescription).toBeNull();
    expect(pc.localDescription.type).toBe('offer');
    expect(pc.signalingState).toBe('have-local-offer');
    expect(pc.operations).toEqual([]);
    expect([...pc.ignoredOfferUfrags]).toEqual(['A1']);
    expect(sentDescriptions(sent)).toEqual([]);
  });

  test('an offer is a collision while makingOffer is set even if signaling is stable', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);
    pc.makingOffer = true;
    pc.signalingState = 'stable';

    await mod.handleSignalingMessage(POLITE, 'peer-description', offer('A2'));

    expect(pc.operations[0]).toBe('rollback');
    expect(pc.remoteDescription.sdp).toContain('a=ice-ufrag:A2');
    expect(pc.localDescription.type).toBe('answer');
  });

  test('a local offer rolled back before negotiation settles is not sent', async () => {
    const { mod, sent } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);
    pc.rollbackBeforeSettle = true;

    pc.onnegotiationneeded();
    await tick();

    expect(pc.signalingState).toBe('stable');
    expect(pc.localDescription).toBeNull();
    expect(sentDescriptions(sent)).toEqual([]);
  });

  test('a renegotiation collision rolls back when a remote description already exists', async () => {
    const { mod, sent } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);
    pc.iceConnectionState = 'connected';
    pc.connectionState = 'connected';
    pc.remoteDescription = { type: 'answer', sdp: sdp('OLD') };
    pc.signalingState = 'have-local-offer';
    pc.localDescription = { type: 'offer', sdp: sdp('NEXT') };
    const same = pc;

    await mod.handleSignalingMessage(POLITE, 'peer-description', offer('NEW'));

    expect(pc).toBe(same);
    expect(pc.operations[0]).toBe('rollback');
    expect(pc.remoteDescription.sdp).toContain('a=ice-ufrag:NEW');
    expect(pc.signalingState).toBe('stable');
    expect(sentDescriptions(sent).map((msg) => msg.description.type)).toEqual(['answer']);
    expect(pc.iceConnectionState).toBe('connected');
  });
});

describe('ICE candidate association', () => {
  test('candidates that arrive before the remote description are applied after it succeeds', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    await mod.handleSignalingMessage(POLITE, 'peer-candidate', candidate('A2', 'early'));
    expect(pc.ice).toEqual([]);
    expect(pc.pendingCandidates).toHaveLength(1);

    await mod.handleSignalingMessage(POLITE, 'peer-description', offer('A2'));

    expect(pc.ice.map((item) => item.usernameFragment)).toEqual(['A2']);
    expect(pc.pendingCandidates).toEqual([]);
    expect(pc.operations.indexOf('remote-offer')).toBeLessThan(pc.operations.length);
  });

  test('candidates from an ignored offer are not applied', async () => {
    const { mod } = stun();
    mod.createPeerConnection(IMPOLITE, false);
    const pc = mod.peers.get(IMPOLITE);
    pc.signalingState = 'have-local-offer';
    pc.localDescription = { type: 'offer', sdp: sdp('local') };

    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', offer('A1'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-candidate', candidate('A1'));

    expect(pc.ice).toEqual([]);
    expect(pc.pendingCandidates || []).toEqual([]);
  });

  test('an ignored ufrag is still rejected after a later answer is accepted', async () => {
    const { mod } = stun();
    mod.createPeerConnection(IMPOLITE, false);
    const pc = mod.peers.get(IMPOLITE);
    pc.signalingState = 'have-local-offer';
    pc.localDescription = { type: 'offer', sdp: sdp('local') };

    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', offer('A1'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', answer('A2'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-candidate', candidate('A1', 'late'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-candidate', candidate('A2', 'good'));

    expect(pc.remoteDescription.sdp).toContain('a=ice-ufrag:A2');
    expect(pc.ignoredOfferUfrags.has('A1')).toBe(true);
    expect(pc.ice.map((item) => item.candidate)).toEqual(['candidate:good']);
  });

  test('every abandoned ufrag stays rejected for the life of the connection', async () => {
    const { mod } = stun();
    mod.createPeerConnection(IMPOLITE, false);
    const pc = mod.peers.get(IMPOLITE);
    pc.signalingState = 'have-local-offer';
    pc.localDescription = { type: 'offer', sdp: sdp('local') };

    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', offer('A1'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', offer('A3'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-candidate', candidate('A1'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-candidate', candidate('A3'));

    expect([...pc.ignoredOfferUfrags]).toEqual(['A1', 'A3']);
    expect(pc.ice).toEqual([]);
    expect(pc.remoteDescription).toBeNull();
  });

  test('a fragment-less candidate is queued during an ignored offer and drained with the answer', async () => {
    const { mod } = stun();
    mod.createPeerConnection(IMPOLITE, false);
    const pc = mod.peers.get(IMPOLITE);
    pc.signalingState = 'have-local-offer';
    pc.localDescription = { type: 'offer', sdp: sdp('local') };

    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', offer('A1'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-candidate', candidate(null, 'bare'));
    expect(pc.ice).toEqual([]);
    expect(pc.pendingCandidates).toHaveLength(1);

    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', answer('A2'));

    expect(pc.ignoreOffer).toBe(false);
    expect(pc.ignoredOfferUfrags.has('A1')).toBe(true);
    expect(pc.ice.map((item) => item.candidate)).toEqual(['candidate:bare']);
  });

  test('a candidate for another ufrag is not applied to the current remote description', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);
    await mod.handleSignalingMessage(POLITE, 'peer-description', offer('A2'));
    await mod.handleSignalingMessage(POLITE, 'peer-candidate', candidate('A3', 'other'));

    expect(pc.ice).toEqual([]);
    expect(pc.pendingCandidates.map((item) => item.usernameFragment)).toEqual(['A3']);
  });

  test('an ignored offer does not blacklist the ufrag of the current remote description', async () => {
    const { mod } = stun();
    mod.createPeerConnection(IMPOLITE, false);
    const pc = mod.peers.get(IMPOLITE);
    pc.remoteDescription = { type: 'answer', sdp: sdp('LIVE') };
    pc.signalingState = 'have-local-offer';
    pc.localDescription = { type: 'offer', sdp: sdp('local') };
    pc.iceConnectionState = 'connected';

    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', offer('LIVE'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-candidate', candidate('LIVE', 'still-good'));

    expect(pc.remoteDescription.sdp).toContain('a=ice-ufrag:LIVE');
    expect(pc.ignoredOfferUfrags.has('LIVE')).toBe(false);
    expect(pc.ice.map((item) => item.candidate)).toEqual(['candidate:still-good']);
  });

  test('candidates that arrive before the connection is created are replayed in order and filtered', async () => {
    const { mod } = stun();
    await mod.handleSignalingMessage(IMPOLITE, 'peer-candidate', candidate('A1', 'too-soon'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-description', offer('A1'));
    await mod.handleSignalingMessage(IMPOLITE, 'peer-candidate', candidate('A2', 'kept'));
    expect(mod.peers.has(IMPOLITE)).toBe(false);

    mod.app.connection.on('stun-new-peer-connection', (peerId, pc) => {
      if (peerId !== IMPOLITE) return;
      pc.signalingState = 'have-local-offer';
      pc.localDescription = { type: 'offer', sdp: sdp('local') };
    });
    mod.createPeerConnection(IMPOLITE, false);
    await tick();

    const pc = mod.peers.get(IMPOLITE);
    expect(pc.remoteDescription).toBeNull();
    expect(pc.ignoredOfferUfrags.has('A1')).toBe(true);
    expect(pc.ice).toEqual([]);
    expect(pc.pendingCandidates.map((item) => item.candidate)).toEqual(['candidate:kept']);
  });
});

describe('per-peer signaling order', () => {
  test('two descriptions for one peer do not overlap their remote-description work', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);
    const gate = defer();
    pc.holdRemote = gate.promise;

    const first = mod.handleSignalingMessage(POLITE, 'peer-description', offer('A2'));
    await tick();
    const second = mod.handleSignalingMessage(POLITE, 'peer-description', offer('A3'));
    await tick();

    expect(pc.remoteEntered).toBe(1);
    gate.release();
    pc.holdRemote = null;
    await Promise.all([first, second]);
    expect(pc.remoteEntered).toBe(2);
    expect(pc.operations.filter((item) => item === 'remote-offer')).toHaveLength(2);
  });

  test('one peer waiting on setRemoteDescription does not block another peer', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    mod.createPeerConnection('cccccccc', false);
    const blocked = mod.peers.get(POLITE);
    const other = mod.peers.get('cccccccc');
    const gate = defer();
    blocked.holdRemote = gate.promise;

    const first = mod.handleSignalingMessage(POLITE, 'peer-description', offer('A2'));
    await tick();
    await mod.handleSignalingMessage('cccccccc', 'peer-description', offer('B2'));

    expect(blocked.remoteDescription).toBeNull();
    expect(other.remoteDescription.sdp).toContain('a=ice-ufrag:B2');
    expect(other.localDescription.type).toBe('answer');
    gate.release();
    await first;
  });

  test('a signaling change while answering schedules the next offer without deadlocking', async () => {
    const { mod, sent } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);
    pc.negotiateAgain = true;

    await mod.handleSignalingMessage(POLITE, 'peer-description', offer('A2'));
    await tick();

    expect(sentDescriptions(sent).map((msg) => msg.description.type)).toEqual(['answer', 'offer']);
    expect(pc.localDescription.type).toBe('offer');
    expect(pc.makingOffer).toBe(false);
  });

  test('repeated negotiation requests produce one local offer at a time', async () => {
    const { mod, sent } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    pc.onnegotiationneeded();
    pc.onnegotiationneeded();
    await tick();

    expect(pc.operations.filter((item) => item === 'local-offer')).toEqual(['local-offer']);
    expect(sentDescriptions(sent)).toHaveLength(1);
    expect(sentDescriptions(sent)[0].description.type).toBe('offer');
    expect(pc.makingOffer).toBe(false);
  });
});

describe('bounded ICE restart', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function fail(pc) {
    pc.iceConnectionState = 'failed';
    pc.oniceconnectionstatechange();
  }

  function enter(pc, state) {
    pc.iceConnectionState = state;
    pc.oniceconnectionstatechange();
  }

  async function advance(ms) {
    jest.advanceTimersByTime(ms);
    for (let step = 0; step < 8; step += 1) await Promise.resolve();
  }

  test('one failure schedules one restart, and a repeated failure does not schedule another', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    fail(pc);
    const timer = pc.iceRestartTimer;
    expect(timer).toBeTruthy();
    expect(pc.iceRestartCount).toBe(0);
    expect(pc.restartCount || 0).toBe(0);

    pc.oniceconnectionstatechange();
    expect(pc.iceRestartTimer).toBe(timer);
    expect(pc.restartCount || 0).toBe(0);

    await advance(1000);
    expect(pc.restartCount).toBe(1);
    expect(pc.iceRestartCount).toBe(1);
    expect(pc.iceRestartTimer).toBeNull();
  });

  test('a fourth failure does not schedule another restart', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    fail(pc);
    await advance(1000);
    enter(pc, 'checking');
    fail(pc);
    await advance(2000);
    enter(pc, 'checking');
    fail(pc);
    await advance(4000);

    expect(pc.restartCount).toBe(3);
    expect(pc.iceRestartCount).toBe(3);
    enter(pc, 'checking');
    fail(pc);
    expect(pc.iceRestartTimer).toBeNull();
    await advance(8000);
    expect(pc.restartCount).toBe(3);
  });

  test('connected and completed clear a pending restart and the attempt count', async () => {
    const { mod } = stun();
    const notes = [];
    mod.app.connection.on('stun-diagnostic', (peer, message) => notes.push(message));
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    enter(pc, 'connected');
    expect(notes).not.toContain('ICE recovered');

    fail(pc);
    enter(pc, 'connected');
    expect(pc.iceRestartTimer).toBeNull();
    expect(pc.iceRestartCount).toBe(0);
    expect(notes).toContain('ICE recovered');

    fail(pc);
    await advance(1000);
    expect(pc.iceRestartCount).toBe(1);
    enter(pc, 'completed');
    expect(pc.iceRestartCount).toBe(0);
    expect(pc.iceRestartTimer).toBeNull();
  });

  test('recovery allows a later failure to start again at one second', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    fail(pc);
    await advance(1000);
    enter(pc, 'connected');
    fail(pc);
    expect(pc.iceRestartCount).toBe(0);
    expect(pc.iceRestartTimer).toBeTruthy();
    await advance(999);
    expect(pc.restartCount).toBe(1);
    await advance(1);
    expect(pc.restartCount).toBe(2);
    expect(pc.iceRestartCount).toBe(1);
  });

  test('checking does not reset the attempt count', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    fail(pc);
    await advance(1000);
    enter(pc, 'checking');
    expect(pc.iceRestartCount).toBe(1);
    expect(pc.iceRestartTimer).toBeNull();
  });

  test('disconnected does not restart, and a later failure does', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    enter(pc, 'disconnected');
    expect(pc.iceRestartTimer).toBeNull();
    expect(pc.restartCount || 0).toBe(0);

    fail(pc);
    await advance(1000);
    expect(pc.restartCount).toBe(1);
  });

  test('removing the peer cancels a pending restart', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    fail(pc);
    mod.removePeerConnection(POLITE);
    await advance(1000);
    expect(pc.restartCount || 0).toBe(0);
    expect(mod.peers.has(POLITE)).toBe(false);
  });

  test('two peers keep independent restart counts', async () => {
    const { mod } = stun();
    mod.createPeerConnection(POLITE, false);
    mod.createPeerConnection(IMPOLITE, false);
    const polite = mod.peers.get(POLITE);
    const impolite = mod.peers.get(IMPOLITE);

    fail(polite);
    await advance(1000);
    expect(polite.restartCount).toBe(1);
    expect(impolite.restartCount || 0).toBe(0);
    expect(impolite.iceRestartCount).toBe(0);

    fail(impolite);
    expect(impolite.iceRestartTimer).toBeTruthy();
    expect(polite.iceRestartTimer).toBeNull();
    expect(polite.iceRestartCount).toBe(1);
  });

  test('a restart produces one offer through negotiationneeded', async () => {
    const { mod, sent } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);

    fail(pc);
    await advance(1000);

    expect(pc.restartCount).toBe(1);
    expect(pc.operations.filter((item) => item === 'local-offer')).toEqual(['local-offer']);
    expect(sentDescriptions(sent).map((msg) => msg.description.type)).toEqual(['offer']);
    expect(pc.signalingState).toBe('have-local-offer');
  });

  test('a restart requested while signaling is busy waits until stable', async () => {
    const { mod, sent } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);
    pc.signalingState = 'have-local-offer';
    pc.localDescription = { type: 'offer', sdp: 'local-offer' };

    fail(pc);
    await advance(1000);

    expect(pc.restartCount).toBe(1);
    expect(pc.negotiateAgain).toBe(true);
    expect(pc.operations.filter((item) => item === 'local-offer')).toEqual([]);
    expect(sentDescriptions(sent)).toEqual([]);

    pc.signalingState = 'stable';
    pc.onsignalingstatechange();
    await advance(0);

    expect(pc.operations.filter((item) => item === 'local-offer')).toEqual(['local-offer']);
    expect(sentDescriptions(sent)).toHaveLength(1);
    expect(pc.makingOffer).toBe(false);
  });

  test('the negotiation cool-off does not discard an ICE restart offer', async () => {
    const { mod, sent } = stun();
    mod.createPeerConnection(POLITE, false);
    const pc = mod.peers.get(POLITE);
    pc.negotiation_counter = 11;

    pc.onnegotiationneeded();
    await advance(0);
    expect(sentDescriptions(sent)).toEqual([]);

    fail(pc);
    await advance(1000);

    expect(pc.restartCount).toBe(1);
    expect(sentDescriptions(sent).map((msg) => msg.description.type)).toEqual(['offer']);
  });
});
