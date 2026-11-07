/**
 * Three independent VideoCall clients join one embedded call.
 *
 * This is not three browsers. Playwright in this repository only smoke-tests a
 * page, and a real mesh needs a Saito node plus WebRTC. Each client is a
 * separate Videocall and Stun instance, with its own key, wallet, and module
 * state. Signaling uses the real transaction handlers. Media devices and
 * RTCPeerConnection are synthetic.
 */
const { JSDOM } = require('jsdom');
const { EventEmitter } = require('events');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/game' });
dom.window.requestAnimationFrame = () => 0;
dom.window.cancelAnimationFrame = () => {};
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.navigator = dom.window.navigator;
global.getComputedStyle = dom.window.getComputedStyle;
global.MediaStream = class MediaStream {
  constructor(tracks = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }
  addTrack(track) {
    this.tracks.push(track);
  }
  removeTrack(track) {
    this.tracks = this.tracks.filter((item) => item !== track);
  }
};

global.Audio = class {
  play() {
    return Promise.resolve();
  }
};
global.AudioContext = class {
  createMediaStreamSource() {
    return { connect() {} };
  }
  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 8,
      getByteFrequencyData() {},
      connect() {}
    };
  }
  createGain() {
    return { connect() {} };
  }
};
dom.window.AudioContext = global.AudioContext;
global.siteMessage = () => {};
global.salert = () => {};
global.sconfirm = async () => false;

class FakePeerConnection {
  constructor() {
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.iceGatheringState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
    this.localTracks = [];
    this.senders = [];
    this.listeners = {};
    this.trace = [];
  }

  addEventListener(name, handler) {
    this.listeners[name] = this.listeners[name] || [];
    this.listeners[name].push(handler);
  }

  dispatch(name, event) {
    for (const handler of this.listeners[name] || []) handler(event);
  }

  createDataChannel() {
    const channel = { send() {}, readyState: 'connecting' };
    setTimeout(() => {
      channel.readyState = 'open';
      channel.onopen?.();
    }, 0);
    queueMicrotask(() => this.onnegotiationneeded?.());
    return channel;
  }

  addTrack(track) {
    this.localTracks.push(track);
    const sender = {
      track,
      trackRole: null,
      getParameters: () => ({ encodings: [{}], transactionId: '1' }),
      async setParameters() {}
    };
    this.senders.push(sender);
    return sender;
  }

  getSenders() {
    return this.senders;
  }

  markConnected() {
    if (this.connectionState === 'connected') return;
    this.iceConnectionState = 'connected';
    this.connectionState = 'connected';
    this.trace.push('connected');
    this.oniceconnectionstatechange?.();
    this.onconnectionstatechange?.();
  }

  async setLocalDescription(description) {
    if (description?.type === 'rollback') {
      if (this.signalingState === 'stable') {
        const error = new Error('Cannot rollback from stable');
        error.name = 'InvalidStateError';
        throw error;
      }
      this.localDescription = this.remoteDescription ? this.settledLocal || null : null;
      this.signalingState = 'stable';
      this.trace.push('rollback');
      this.onsignalingstatechange?.();
      return;
    }

    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
    this.localDescription = {
      type,
      sdp: JSON.stringify({
        tracks: this.localTracks.map((track) => ({ kind: track.kind, id: track.id }))
      })
    };
    // An offer is still outstanding when this promise resolves. Only an answer
    // returns the connection to stable.
    this.signalingState = type === 'answer' ? 'stable' : 'have-local-offer';
    if (type === 'answer') this.settledLocal = this.localDescription;
    this.trace.push(`local ${type}`);
    this.onsignalingstatechange?.();
    if (this.candidate && this.remoteDescription && this.signalingState === 'stable') {
      this.markConnected();
    }
    this.onicecandidate?.({
      candidate: { candidate: `candidate:${type}:${this.localTracks[0]?.id || 'none'}`, sdpMid: '0' }
    });
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    if (description.type === 'answer') this.settledLocal = this.localDescription;
    this.trace.push(`remote ${description.type}`);
    this.onsignalingstatechange?.();
    let tracks = [];
    try {
      tracks = JSON.parse(description.sdp || '{}').tracks || [];
    } catch (err) {
      tracks = [];
    }
    for (const track of tracks) {
      try {
        this.dispatch('track', {
          track: {
            kind: track.kind,
            id: track.id,
            readyState: 'live',
            enabled: true,
            muted: false,
            addEventListener() {}
          },
          streams: []
        });
      } catch (err) {
        this.trace.push(`${err.name}: ${err.message}`);
        throw err;
      }
    }
  }

  async addIceCandidate(candidate) {
    this.candidate = candidate;
    this.iceConnectionState = 'checking';
    this.trace.push('ice checking');
    this.oniceconnectionstatechange?.();
    if (this.localDescription && this.remoteDescription) this.markConnected();
  }

  restartIce() {}

  close() {
    this.connectionState = 'closed';
    this.signalingState = 'closed';
    this.iceConnectionState = 'closed';
  }
}

global.RTCPeerConnection = FakePeerConnection;

const Videocall = require('../../../mods/videocall/videocall');
const Stun = require('../../../mods/stun/stun');

function track(kind, owner) {
  return {
    kind,
    id: `${owner}-${kind}`,
    enabled: true,
    readyState: 'live',
    muted: false,
    stop: jest.fn(),
    addEventListener() {},
    applyConstraints: jest.fn(async () => {})
  };
}

function keychain() {
  const stored = new Map();
  return {
    stored,
    returnKey(id) {
      return stored.get(id);
    },
    addKey(id, value) {
      stored.set(id, value);
    },
    saveKeys() {},
    addWatchedPublicKey() {},
    returnUsername(key) {
      return key;
    },
    returnIdentifierByPublicKey(key) {
      return key;
    },
    returnIdenticon() {
      return '';
    },
    returnKeys() {
      return [];
    }
  };
}

function wallet(publicKey) {
  let sequence = 0;
  return {
    async createUnsignedTransactionWithDefaultFee(recipient) {
      const tx = {
        msg: {},
        from: [{ publicKey }],
        to: [],
        timestamp: Date.now(),
        signature: `${publicKey}:${sequence++}:${Date.now()}`,
        addTo(key) {
          this.to.push({ publicKey: key });
        },
        isTo(key) {
          return this.to.some((item) => item.publicKey === key);
        },
        isFrom(key) {
          return this.from[0].publicKey === key;
        },
        returnMessage() {
          return this.msg;
        },
        async sign() {}
      };
      if (recipient) tx.addTo(recipient);
      return tx;
    }
  };
}

function client(name, publicKey) {
  const connection = new EventEmitter();
  connection.setMaxListeners(50);
  const keys = keychain();
  const app = {
    BROWSER: 1,
    connection,
    wallet: wallet(publicKey),
    keychain: keys,
    options: { stun: { settings: {} }, videocall: { settings: {} } },
    storage: { saveOptions() {} },
    browser: {
      lockNavigation() {},
      unlockNavigation() {},
      addElementToDom(markup, parent) {
        const host = parent || document.body;
        const holder = document.createElement('div');
        holder.innerHTML = markup;
        while (holder.firstChild) host.appendChild(holder.firstChild);
      },
      addElementToClass() {},
      addElementToSelector() {}
    },
    crypto: {
      generateKeys: () => `room-secret-${name}`,
      generatePublicKey: (secret) => `room-${secret}`,
      stringToBase64: (value) => Buffer.from(value).toString('base64'),
      base64ToString: (value) => Buffer.from(value, 'base64').toString()
    },
    network: { propagateTransaction() {} },
    modules: {}
  };
  const mod = new Videocall(app);
  mod.publicKey = publicKey;
  mod.browser_active = 0;
  const stun = new Stun(app);
  stun.publicKey = publicKey;
  stun.earlySignals = stun.earlySignals || new Map();
  mod.stun = stun;
  app.modules.returnFirstRespondTo = () => stun;
  const created = {
    name,
    app,
    mod,
    stun,
    signals: [],
    errors: []
  };
  connection.on('stun-diagnostic', (peer, message) => {
    created.signals.push(`${peer}: ${message}`);
  });
  return created;
}

function snapshot(clients) {
  return clients.map((item) => ({
    name: item.name,
    key: item.mod.publicKey,
    membership: item.mod.room_obj?.call_peers || null,
    connections: [...item.stun.peers.entries()].map(([peer, pc]) => ({
      peer,
      connection: pc.connectionState,
      ice: pc.iceConnectionState,
      signaling: pc.signalingState,
      local: pc.localDescription?.type || null,
      remote: pc.remoteDescription?.type || null,
      trace: pc.trace
    })),
    windows: item.mod.CallInterface
      ? [...item.mod.CallInterface.presentation.panels.keys()]
      : [],
    remoteStreams: item.mod.streams ? [...item.mod.streams.remoteStreams.keys()] : [],
    signals: item.signals,
    errors: item.errors
  }));
}

async function waitFor(label, clients, ready) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${label}\n${JSON.stringify(snapshot(clients), null, 2)}`);
}

describe('three independent browsers in one embedded call', () => {
  test('the third participant joins the existing call through the room link', async () => {
    const alpha = client('A', 'alpha-key');
    const beta = client('B', 'beta-key');
    const gamma = client('C', 'gamma-key');
    const clients = [alpha, beta, gamma];

    global.navigator.mediaDevices = {
      getUserMedia: async () =>
        new MediaStream([track('audio', 'local'), track('video', 'local')])
    };

    const deliver = async (tx) => {
      const message = tx.returnMessage();
      for (const item of clients) {
        if (tx.isFrom(item.mod.publicKey) || !tx.isTo(item.mod.publicKey)) continue;
        try {
          if (message.module === 'Stun') {
            await item.stun.handlePeerTransaction(item.app, tx);
          }
          if (message.module === 'Videocall' || message.module === 'Stun') {
            await item.mod.handlePeerTransaction(item.app, tx);
          }
        } catch (err) {
          item.errors.push(`${message.module}:${message.request}: ${err.message}`);
        }
      }
    };

    for (const item of clients) {
      item.app.connection.on('relay-transaction', (tx) => {
        void deliver(tx);
      });
      item.app.network.propagateTransaction = (tx) => {
        void deliver(tx);
      };
    }

    alpha.mod.createRoom('game');
    alpha.mod.room_obj.ui = 'video';
    alpha.mod.beginGameCall();
    await waitFor('A did not enter the call', clients, () => alpha.mod.have_joined_room);

    const link = alpha.mod.generateCallLink();
    const encoded = new URL(link).searchParams.get('stun_video_chat');
    expect(encoded).toBeTruthy();

    beta.mod.receiveInGameCall(JSON.parse(JSON.stringify(alpha.mod.room_obj)));
    beta.mod.initializeCallInterface({
      ui: beta.mod.room_obj.ui,
      audio: true,
      video: beta.mod.room_obj.ui === 'video'
    });
    beta.mod.streams.start();
    await waitFor('A and B did not connect', clients, () => {
      const forward = alpha.stun.peers.get(beta.mod.publicKey);
      const back = beta.stun.peers.get(alpha.mod.publicKey);
      return forward?.connectionState === 'connected' && back?.connectionState === 'connected';
    });

    const pairBefore = alpha.stun.peers.get(beta.mod.publicKey);
    expect(pairBefore.connectionState).toBe('connected');
    expect(pairBefore.iceConnectionState).toBe('connected');

    const joined = JSON.parse(gamma.app.crypto.base64ToString(encoded));
    expect(joined.call_id).toBe(alpha.mod.room_obj.call_id);
    gamma.mod.room_obj = joined;
    gamma.mod.initializeCallInterface({
      ui: joined.ui,
      audio: true,
      video: true
    });
    gamma.mod.streams.start();

    await waitFor('the three-party mesh did not connect', clients, () => {
      return clients.every((item) => {
        const others = clients
          .filter((peer) => peer !== item)
          .map((peer) => peer.mod.publicKey);
        return others.every((key) => item.stun.peers.get(key)?.connectionState === 'connected');
      });
    });

    for (const item of clients) {
      const others = clients
        .filter((peer) => peer !== item)
        .map((peer) => peer.mod.publicKey)
        .sort();
      expect([...(item.mod.room_obj.call_peers || [])].sort()).toEqual(others);
      expect([...item.stun.peers.keys()].sort()).toEqual(others);
      for (const key of others) {
        const pc = item.stun.peers.get(key);
        expect(pc.connectionState).toBe('connected');
        expect(pc.iceConnectionState).toBe('connected');
        expect(pc.localDescription?.type).toBeTruthy();
        expect(pc.remoteDescription?.type).toBeTruthy();
        expect(item.mod.streams.remoteStreams.has(key)).toBe(true);
        expect(item.mod.CallInterface.presentation.panels.has(key)).toBe(true);
      }
      expect(item.errors).toEqual([]);
    }

    expect(alpha.stun.peers.get(beta.mod.publicKey)).toBe(pairBefore);
    expect(pairBefore.connectionState).toBe('connected');
    expect(pairBefore.signalingState).not.toBe('closed');
  }, 20000);
});
