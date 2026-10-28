class AdminServerConnection {
  constructor(mod) {
    this.mod = mod;
    this.state = 'idle';
    this.timer = null;
  }

  update(state) {
    this.state = state;
    this.mod.main?.adminkey_ui?.updateConnection();
  }

  start() {
    if (this.state !== 'idle') return;
    this.update('configured');
    // Core starts the configured peer connection. Allow its handshake to finish
    // before trying the address that served this Admin page.
    this.timer = setTimeout(() => this.connectPageHost(), 5000);
  }

  connectPageHost() {
    this.update('fallback');
    this.timer = setTimeout(() => this.update('failed'), 8000);
    try {
      const url = new URL('/wsopen', window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      // Use the Saito connector so this socket participates in the handshake,
      // peer registry, and signed admin requests.
      globalThis.shared_methods.connect_to_peer(url.href);
    } catch (err) {
      clearTimeout(this.timer);
      this.update('failed');
    }
  }

  onHandshake(peer) {
    if (!this.mod.server_publickey || peer?.publicKey !== this.mod.server_publickey) {
      return false;
    }
    clearTimeout(this.timer);
    this.update('connected');
    return true;
  }

  onDisconnect(publicKey) {
    if (publicKey !== this.mod.server_publickey || this.state !== 'connected') return;
    this.update('idle');
    this.start();
  }
}

module.exports = AdminServerConnection;
