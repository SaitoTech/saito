const THREE = require('three');

class AdminNetworkUI {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.generation = 0;
  }

  render() {
    this.destroy();
    this.root = document.querySelector('.admin-network');
    if (!this.root) return;
    this.root.querySelector('button').onclick = () => this.loadPeers();
    this.draw([]);
    this.onResize = () => this.fitToViewport();
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this.root);
    }
    this.loadPeers();
  }

  async loadPeers() {
    const generation = ++this.generation;
    const root = this.root;
    if (!root) return;
    const status = root.querySelector('[role="status"]');
    const button = root.querySelector('button');
    const finish = (message) => {
      if (generation !== this.generation) return;
      clearTimeout(this.timeout);
      status.textContent = message;
      button.disabled = false;
    };
    button.disabled = true;
    status.textContent = 'Loading connected nodes…';
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      finish('Could not refresh connections. Please retry.');
      this.generation++;
    }, 15000);
    try {
      if (!this.mod.server_info || !this.mod.server_publickey) {
        finish('Waiting for administrator authentication.');
        return;
      }
      const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.mod.server_publickey);
      tx.msg = { module: 'Admin', request: 'list-peers' };
      await tx.sign();
      if (generation !== this.generation) return;
      await this.app.network.sendTransactionWithCallback(tx, (response) => {
        if (generation !== this.generation) return;
        const res = typeof response?.returnMessage === 'function' ? response.returnMessage() : response;
        if (res?.err || !Array.isArray(res?.result)) {
          finish(res?.err || 'Could not load connections. Please retry.');
          return;
        }
        const peers = res.result.filter((peer) => peer.status === 'connected');
        this.draw(peers);
        finish(peers.length ? `${peers.length} connected nodes` : 'No connected nodes.');
      }, this.mod.server_publickey);
    } catch (err) {
      finish('Could not load connections. Please retry.');
    }
  }

  address(peer) {
    const endpoint = peer.endpoint || peer;
    const host = endpoint.host || peer.host;
    if (!host) return peer.ip ? `IP: ${peer.ip}` : 'IP / URL unavailable';
    const hostname = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    const port = endpoint.port || peer.port;
    return `${endpoint.protocol || peer.protocol || 'http'}://${hostname}${port ? `:${port}` : ''}`;
  }

  draw(peers) {
    this.disposeScene();
    const stage = this.root.querySelector('.admin-network-stage');
    stage.replaceChildren();
    // Logical node positions are fitted by the camera; labels stay in screen pixels.
    const radius = Math.max(250, peers.length * 38);
    const twoNodes = peers.length === 1;
    // Leave room to the right of the outermost node for its label.
    const width = twoNodes ? 440 : radius * 2 + 440;
    const height = twoNodes ? radius + 240 : radius * 2 + 240;
    const origin = new THREE.Vector3(0, twoNodes ? radius / 2 : 0, 0);
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    const scene = this.scene = new THREE.Scene();
    const camera = this.camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 1, 1000);
    camera.position.z = 600;
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-100, 200, 400);
    scene.add(light);

    const nodes = [{
      ...this.mod.server_info?.options?.server,
      // Use the same identity as the overview; server settings may contain an empty key.
      publicKey: this.mod.server_publickey,
      kind: 'This node', x: origin.x, y: origin.y, color: 0xe64760
    }, ...peers.map((peer, index) => {
      const angle = (index / peers.length) * Math.PI * 2 + Math.PI / 2;
      return { ...peer, kind: peer.synctype === 'full' ? 'Full node' : peer.synctype === 'lite' ? 'Browser' : 'Unknown type',
        x: twoNodes ? 0 : Math.cos(angle) * radius,
        y: twoNodes ? -radius / 2 : Math.sin(angle) * radius,
        color: peer.synctype === 'full' ? 0x357bd8 : 0x159b87 };
    })];

    this.nodeLabels = [];
    nodes.forEach((node, index) => {
      const position = new THREE.Vector3(node.x, node.y, 0);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(index ? 10 : 15, 24, 16),
        new THREE.MeshStandardMaterial({ color: node.color, roughness: 0.35 }));
      sphere.position.copy(position);
      scene.add(sphere);
      if (index) {
        const displacement = position.clone().sub(origin);
        const distance = displacement.length();
        const direction = displacement.normalize();
        const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0);
        if (node.synctype === 'full') {
          // Parallel arrows, one in each direction, identify full-node links.
          for (const sign of [-1, 1]) {
            const offset = perpendicular.clone().multiplyScalar(sign * 4);
            const start = sign === 1 ? origin.clone().addScaledVector(direction, 20) : position.clone().addScaledVector(direction, -20);
            scene.add(new THREE.ArrowHelper(direction.clone().multiplyScalar(sign), start.add(offset), distance - 40, node.color, 12, 7));
          }
        } else {
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, position]),
            new THREE.LineBasicMaterial({ color: node.color })));
        }
      }
      const label = document.createElement('div');
      label.className = 'admin-network-label';
      this.nodeLabels.push({ label, position });
      const title = document.createElement('strong');
      title.textContent = node.kind;
      const key = document.createElement('span');
      key.className = 'admin-network-key';
      key.textContent = node.publicKey || 'Public key unavailable';
      key.title = key.textContent;
      const address = document.createElement('span');
      address.textContent = this.address(node);
      label.append(title, key, address);
      stage.append(label);
    });
    try {
      const renderer = this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.setAttribute('aria-hidden', 'true');
      stage.prepend(renderer.domElement);
      this.root.querySelector('.admin-network-fallback').hidden = true;
    } catch (err) {
      this.disposeScene();
      this.root.querySelector('.admin-network-fallback').hidden = false;
    }
    this.fitToViewport();
  }

  fitToViewport() {
    if (!this.root) return;
    const viewport = this.root.querySelector('.admin-network-viewport');
    const stage = this.root.querySelector('.admin-network-stage');
    const size = this.root.querySelector('.admin-network-size');
    // Use the document position so scrolling does not change the diagram's size.
    const top = this.root.getBoundingClientRect().top + window.scrollY;
    const height = Math.max(600, window.innerHeight - top - 24);
    const width = Math.max(320, viewport.clientWidth || this.root.clientWidth || 600);
    this.root.style.setProperty('--admin-network-height', `${height}px`);
    stage.style.width = size.style.width = `${width}px`;
    stage.style.height = size.style.height = `${height}px`;

    const xs = this.nodeLabels.map(({ position }) => position.x);
    const ys = this.nodeLabels.map(({ position }) => position.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    // Reserve fixed pixel space for the controls and lower-right labels.
    const left = 30, right = width - 210;
    const topInset = Math.max(120, (this.root.querySelector('.admin-network-controls')?.offsetHeight || 0) + 30);
    const bottom = height - 120;
    const scale = Math.min((right - left) / Math.max(1, maxX - minX),
      (bottom - topInset) / Math.max(1, maxY - minY), 1.5);
    const camera = this.camera;
    camera.left = -width / (2 * scale);
    camera.right = width / (2 * scale);
    camera.top = height / (2 * scale);
    camera.bottom = -height / (2 * scale);
    camera.position.x = (minX + maxX) / 2 - ((left + right) / 2 - width / 2) / scale;
    camera.position.y = (minY + maxY) / 2 + ((topInset + bottom) / 2 - height / 2) / scale;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    for (const { label, position } of this.nodeLabels) {
      const projected = position.clone().project(camera);
      label.style.left = `${(projected.x + 1) * width / 2 + 20}px`;
      label.style.top = `${(1 - projected.y) * height / 2 + 20}px`;
    }
    if (this.renderer) {
      try {
        this.renderer.setSize(width, height, false);
        this.renderer.render(this.scene, camera);
      } catch (err) {
        this.disposeScene();
        this.root.querySelector('.admin-network-fallback').hidden = false;
      }
    }
  }

  disposeScene() {
    const geometries = new Set();
    const materials = new Set();
    this.scene?.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
  }

  destroy() {
    this.generation++;
    clearTimeout(this.timeout);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.disposeScene();
    this.nodeLabels = [];
    this.camera = null;
    this.root = null;
  }
}

module.exports = AdminNetworkUI;
