class AdminServerConnection {
  constructor(mod) {
    this.mod = mod;
    this.state = 'idle';
    this.timer = null;
    this.tried_fallback = false;
  }

  start() {
    if (!this.mod.app?.BROWSER) {
      return;
    }
    this.setState(this.configuredPeer() ? 'configured' : 'fallback');
    if (this.state === 'fallback') {
      this.connectFallback();
    }
    this.armTimeout();
  }

  configuredPeer() {
    const peers = this.mod.app?.options?.peers;
    if (!Array.isArray(peers)) {
      return null;
    }
    return (
      peers.find((peer) => {
        const protocol = String(peer?.protocol || '');
        return peer?.host && peer?.port && (protocol === 'http' || protocol === 'https');
      }) || null
    );
  }

  pagePeer() {
    const page = window.location;
    const protocol = page.protocol === 'https:' ? 'https' : 'http';
    return {
      host: page.hostname,
      port: Number(page.port || (protocol === 'https' ? 443 : 80)),
      protocol,
      synctype: 'lite'
    };
  }

  samePeer(left, right) {
    if (!left || !right) {
      return false;
    }
    return (
      String(left.host).toLowerCase() === String(right.host).toLowerCase() &&
      String(left.port) === String(right.port) &&
      left.protocol === right.protocol
    );
  }

  connectFallback() {
    this.tried_fallback = true;
    const page = this.pagePeer();
    if (this.samePeer(this.configuredPeer(), page)) {
      return;
    }
    this.setState('fallback');
    if (typeof this.mod.connectPeer === 'function') {
      this.mod.connectPeer(page);
    }
  }

  armTimeout() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.state === 'connected' || this.state === 'failed') {
        return;
      }
      if (!this.tried_fallback) {
        this.connectFallback();
        this.armTimeout();
        return;
      }
      this.setState('failed');
    }, 8000);
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  onHandshake(peer) {
    const expected = this.mod.server_publickey;
    if (!expected || peer?.publicKey !== expected) {
      return false;
    }
    this.clearTimer();
    this.setState('connected');
    return true;
  }

  onDisconnect(publicKey) {
    const expected = this.mod.server_publickey;
    if (expected && publicKey !== expected) {
      return;
    }
    if (this.state === 'connected' && !this.tried_fallback) {
      this.connectFallback();
      this.armTimeout();
      return;
    }
    this.clearTimer();
    this.setState('failed');
  }

  setState(state) {
    this.state = state;
    const key = this.mod.main?.adminkey_ui;
    if (key && typeof key.updateConnection === 'function') {
      key.updateConnection();
    }
  }
}

module.exports = AdminServerConnection;
