const Peer = require('./peer');

class Peers {
  constructor(mod) {
    this.mod = mod;
    this.records = new Map();
  }

  add(peerKey) {
    let peer = this.records.get(peerKey);
    if (!peer) {
      peer = new Peer(this.mod, peerKey);
      this.records.set(peerKey, peer);
    }
    return peer;
  }

  get(peerKey) {
    return this.records.get(peerKey) || null;
  }

  list() {
    return [...this.records.values()];
  }

  connect(peerKey, options) {
    return this.add(peerKey).connect(options);
  }

  disconnect(peerKey) {
    const peer = this.records.get(peerKey);
    if (!peer) {
      return this.mod.peerManager?.removePeerConnection?.(peerKey);
    }
    const result = peer.disconnect();
    this.records.delete(peerKey);
    return result;
  }
}

module.exports = Peers;
