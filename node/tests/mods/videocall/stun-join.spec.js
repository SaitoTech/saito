class FakePeerConnection {
  constructor() {
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.iceGatheringState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
  }

  addEventListener() {}

  createDataChannel() {
    return {};
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }

  async setLocalDescription() {
    this.localDescription = { type: this.signalingState === 'have-remote-offer' ? 'answer' : 'offer' };
    this.signalingState = 'stable';
    this.onsignalingstatechange?.();
  }

  async addIceCandidate(candidate) {
    this.candidate = candidate;
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
