class Peer {
  constructor(mod, key) {
    this.mod = mod;
    this.key = key;
    this.claims = new Map();
  }

  get connection() {
    return this.mod.peerManager?.peers?.get(this.key) || null;
  }

  connect({ role = 'offer', onReady } = {}) {
    let callback = null;
    if (role === 'answer' || onReady === false) {
      callback = false;
    } else if (typeof onReady === 'function') {
      callback = onReady;
    }
    if (role === 'answer') {
      return this.mod.peerManager.createPeerConnection(this.key, callback, true);
    }
    return this.mod.peerManager.createPeerConnection(this.key, callback);
  }

  disconnect() {
    this.claims.clear();
    return this.mod.peerManager.removePeerConnection(this.key);
  }

  send(transaction) {
    if (!this.isConnected()) return false;
    this.mod.peerManager.sendTransaction(this.key, transaction);
    return true;
  }

  isConnected() {
    return !!this.mod.peerManager?.hasConnectionWithPeer?.(this.key);
  }

  addStream(stream, claim = 'call') {
    const pc = this.connection;
    const media = stream?.getMediaStream?.() || stream?.mediaStream;
    if (!pc || !media?.getTracks) return [];
    const live = media.getTracks().filter(
      (track) => (track.kind === 'audio' || track.kind === 'video') && track.readyState !== 'ended'
    );
    const role = stream.kind === 'display' ? 'screen' : 'camera';
    if (!this.claims.has(claim)) this.claims.set(claim, new Map());
    const claimed = this.claims.get(claim);
    const attached = [];
    for (const track of live) {
      const claimKey = `${stream.id}:${track.kind}`;
      const current = claimed.get(claimKey);
      if (
        current?.sender &&
        current.sender.track &&
        current.sender.track !== track &&
        current.sender.track.readyState !== 'ended' &&
        typeof current.sender.replaceTrack === 'function'
      ) {
        Promise.resolve(current.sender.replaceTrack(track)).catch((err) => console.error(err));
        if (track.kind === 'video') current.sender.trackRole = role;
        attached.push(current.sender);
        continue;
      }
      if (pc.getSenders().some((sender) => sender.track === track)) {
        const sender = pc.getSenders().find((item) => item.track === track);
        if (sender && track.kind === 'video') sender.trackRole = role;
        claimed.set(claimKey, { sender, streamId: stream.id, kind: track.kind });
        continue;
      }
      const sender = stream.kind === 'display' ? pc.addTrack(track, media) : pc.addTrack(track);
      if (track.kind === 'video' && sender) sender.trackRole = role;
      claimed.set(claimKey, { sender, streamId: stream.id, kind: track.kind });
      attached.push(sender);
    }
    for (const [claimKey, item] of claimed) {
      if (!claimKey.startsWith(`${stream.id}:`)) continue;
      if (!live.some((track) => track.kind === item.kind)) {
        this._release(claim, claimKey, item);
      }
    }
    return attached;
  }

  removeStream(stream, claim = 'call') {
    const claimed = this.claims.get(claim);
    if (!claimed) return;
    const id = stream?.id || stream;
    for (const [claimKey, item] of [...claimed.entries()]) {
      if (claimKey.startsWith(`${id}:`)) this._release(claim, claimKey, item);
    }
  }

  streams() {
    const ids = new Set();
    for (const claimed of this.claims.values()) {
      for (const item of claimed.values()) ids.add(item.streamId);
    }
    return [...ids];
  }

  _release(claim, claimKey, item) {
    const claimed = this.claims.get(claim);
    claimed.delete(claimKey);
    const stillUsed = [...this.claims.values()].some((group) =>
      [...group.values()].some((other) => other.sender === item.sender)
    );
    if (stillUsed) return;
    try {
      this.connection?.removeTrack?.(item.sender);
    } catch (err) {
      console.error(err);
    }
  }
}

module.exports = Peer;
