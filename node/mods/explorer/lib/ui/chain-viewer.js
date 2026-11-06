const Template = require('./chain-viewer.template');
const { sendExplorerPeerRequest } = require('../peer/client');

const SPACING = 3;
const COLORS = { canonical: 0x41bfac, fork: 0xf0ac55, unknown: 0x8994ad, selected: 0xe64c65 };
const chainStatus = (block) =>
  block.in_longest_chain === 1 ? 'canonical' : block.in_longest_chain === 0 ? 'fork' : 'unknown';

class ChainViewer {
  constructor(app, mod, anchor = '') {
    this.app = app;
    this.mod = mod;
    this.anchor = anchor;
    this.blocks = new Map();
    this.lanes = new Map();
    this.coverage = new Map();
    this.center = null;
    this.vertical = 0;
    this.scale = 32;
    this.selected = null;
    this.disposed = false;
    this.loading = false;
    this.waiters = new Set();
    this.controller = new AbortController();
  }

  async render(container) {
    this.app.browser.replaceElementContentBySelector(Template(), container);
    this.root = document.querySelector('.explorer-chain');
    this.stage = this.root.querySelector('.explorer-chain-stage');
    this.labels = this.root.querySelector('.explorer-chain-labels');
    this.attachEvents();
    this.status('Loading chain…');
    try {
      this.THREE = await import('three');
      if (this.disposed) return;
      this.setupScene();
    } catch (err) {
      this.stage.classList.add('without-webgl');
      this.stage.setAttribute('aria-label', '3D unavailable. Use the block list below.');
      this.root.querySelector('details').open = true;
      const message = document.createElement('p');
      message.textContent = '3D view unavailable. Browse the block list below.';
      this.stage.append(message);
    }
    if (this.disposed) return;
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.stage);
    this.refresh();
  }

  setupScene() {
    const T = this.THREE;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.stage.prepend(this.renderer.domElement);
    this.scene = new T.Scene();
    this.camera = new T.OrthographicCamera(-10, 10, 6, -6, 0.1, 100);
    this.camera.position.set(0, 0, 25);
    this.scene.add(new T.AmbientLight(0xffffff, 2));
    const light = new T.DirectionalLight(0xffffff, 3);
    light.position.set(-3, 8, 12);
    this.scene.add(light);
    this.geometry = new T.BoxGeometry(1, 1, 1);
    this.material = new T.MeshStandardMaterial({ roughness: 0.65, metalness: 0.1 });
    this.lineMaterial = new T.LineBasicMaterial({
      color: 0x798a9b,
      transparent: true,
      opacity: 0.55
    });
    this.raycaster = new T.Raycaster();
  }

  status(text) {
    if (!this.disposed) this.root.querySelector('[data-chain-status]').textContent = text;
  }

  request(params) {
    return new Promise((resolve, reject) => {
      const finish = (err, value) => {
        clearTimeout(timer);
        this.waiters.delete(cancel);
        err ? reject(err) : resolve(value);
      };
      const cancel = () => finish(new Error('Viewer closed'));
      const timer = setTimeout(
        () => finish(new Error('Request timed out. Use Refresh to retry.')),
        20000
      );
      this.waiters.add(cancel);
      try {
        sendExplorerPeerRequest(this.app, 'request chain', {
          peer: this.mod.explorerPeer,
          data: { request: 'request chain', ...params },
          callback: (response) =>
            response?.success
              ? finish(null, response.data)
              : finish(new Error(response?.error || 'Unable to load chain'))
        });
      } catch (err) {
        finish(err);
      }
    });
  }

  async refresh(force = true) {
    if (this.disposed || this.loading) return;
    clearTimeout(this.pollTimer);
    if (!this.mod.explorerPeer) {
      this.status('Waiting for an Explorer peer…');
      return;
    }
    const from = this.center == null ? null : Math.max(1, Math.floor(this.center) - 24);
    const to = from == null ? null : from + 49;
    if (!force && from != null) {
      const [left, right] = this.visibleRange();
      let covered = true;
      for (let h = left; h <= right; h++) {
        if (Date.now() - (this.coverage.get(h) || 0) > 15000) covered = false;
      }
      if (covered) {
        this.pollTimer = setTimeout(() => this.refresh(), 15000);
        return;
      }
    }
    this.loading = true;
    this.status('Loading block metadata…');
    let indexing = false;
    const requestedCenter = this.center;
    try {
      const params = from == null ? (this.anchor ? { anchor: this.anchor } : {}) : { from, to };
      let data = await this.request(params);
      if (this.disposed) return;
      if (data.pending_anchor || data.anchor_missing) {
        indexing = data.pending_anchor;
        this.status(
          data.disk_error ||
            (data.pending_anchor
              ? `Finding block on disk… ${data.scanned_files} files checked`
              : 'Block not found in memory, the index or local disk. Import its archive to browse it.')
        );
        return;
      }
      if (this.center == null) {
        this.center = data.center || data.tip_height || data.from;
        this.selected = data.selected_hash || data.tip_hash;
        this.centerSelection = true;
      }
      // Accumulate complete pages before replacing a window, including siblings
      // beyond the per-response cap. Never infer completeness from row count.
      const rows = [...data.blocks];
      while (data.continuation && !this.disposed) {
        data = await this.request({ from: data.from, to: data.to, ...data.continuation });
        rows.push(...data.blocks);
      }
      if (this.disposed) return;
      for (const [hash, block] of this.blocks) {
        if (block.height >= data.from && block.height <= data.to) this.blocks.delete(hash);
      }
      for (const block of rows) this.blocks.set(block.hash, block);
      if (this.centerSelection) {
        this.layout();
        this.vertical = Math.max(0, (this.lanes.get(this.selected) || 0) - 1) * 2.5;
        this.centerSelection = false;
      }
      for (let h = data.from; h <= data.to; h++) this.coverage.set(h, Date.now());
      for (const [hash, block] of this.blocks) {
        if (Math.abs(block.height - this.center) > 200 && hash !== this.selected) {
          this.blocks.delete(hash);
          this.lanes.delete(hash);
        }
      }
      for (const h of this.coverage.keys())
        if (Math.abs(h - this.center) > 200) this.coverage.delete(h);
      indexing = data.indexing;
      this.tip = data.tip_height;
      this.draw();
      this.showDetails();
      this.status(
        data.disk_error ||
          (indexing
            ? `Discovering older blocks… ${data.scanned_files} disk files checked. More forks may appear.`
            : `Local disk discovery complete${data.scan_errors ? `; ${data.scan_errors} files could not be read` : ''}. Archive imports extend this history.`)
      );
    } catch (err) {
      this.status(err.message);
    } finally {
      this.loading = false;
      if (!this.disposed) {
        if (requestedCenter != null && Math.abs(this.center - requestedCenter) > 8) {
          this.pollTimer = setTimeout(() => this.refresh(false), 0);
        } else this.pollTimer = setTimeout(() => this.refresh(), indexing ? 2000 : 15000);
      }
    }
  }

  visibleRange() {
    const half = this.stage.clientWidth / (2 * this.scale * SPACING);
    return [
      Math.max(1, Math.floor((this.center || 1) - half - 1)),
      Math.ceil((this.center || 1) + half + 1)
    ];
  }

  layout() {
    const used = new Map();
    const ordered = [...this.blocks.values()].sort(
      (a, b) =>
        a.height - b.height ||
        (b.in_longest_chain === 1) - (a.in_longest_chain === 1) ||
        a.hash.localeCompare(b.hash)
    );
    for (const block of ordered) {
      if (!used.has(block.height)) used.set(block.height, new Set());
      const occupied = used.get(block.height);
      let lane =
        block.in_longest_chain === 1
          ? 0
          : (this.lanes.get(block.hash) ?? this.lanes.get(block.parent_hash) ?? 1);
      if (block.in_longest_chain !== 1 && lane === 0) lane = 1;
      while (occupied.has(lane)) lane++;
      occupied.add(lane);
      this.lanes.set(block.hash, lane);
    }
  }

  draw() {
    if (this.disposed || this.center == null) return;
    this.layout();
    const [left, right] = this.visibleRange();
    this.visible = [...this.blocks.values()].filter((b) => b.height >= left && b.height <= right);
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    this.labels.replaceChildren();
    for (let h = left; h <= right; h++) {
      const label = document.createElement('span');
      label.textContent = h.toLocaleString();
      label.style.left = `${width / 2 + (h - this.center) * SPACING * this.scale}px`;
      this.labels.append(label);
    }
    if (this.renderer) {
      const T = this.THREE;
      this.renderer.setSize(width, height, false);
      Object.assign(this.camera, {
        left: -width / (2 * this.scale),
        right: width / (2 * this.scale),
        top: height / (2 * this.scale),
        bottom: -height / (2 * this.scale)
      });
      this.camera.updateProjectionMatrix();
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
      }
      if (this.lines) {
        this.scene.remove(this.lines);
        this.lines.geometry.dispose();
      }
      this.mesh = new T.InstancedMesh(this.geometry, this.material, this.visible.length);
      const object = new T.Object3D();
      const edges = [];
      const position = (block) =>
        new T.Vector3(
          (block.height - this.center) * SPACING,
          2 - (this.lanes.get(block.hash) || 0) * 2.5 + this.vertical,
          0
        );
      this.visible.forEach((block, i) => {
        object.position.copy(position(block));
        object.rotation.set(0.3, -0.45, 0);
        object.updateMatrix();
        this.mesh.setMatrixAt(i, object.matrix);
        this.mesh.setColorAt(
          i,
          new T.Color(block.hash === this.selected ? COLORS.selected : COLORS[chainStatus(block)])
        );
        const parent = this.blocks.get(block.parent_hash);
        if (parent) edges.push(position(parent), position(block));
      });
      this.mesh.computeBoundingSphere();
      this.scene.add(this.mesh);
      this.lines = new T.LineSegments(
        new T.BufferGeometry().setFromPoints(edges),
        this.lineMaterial
      );
      this.scene.add(this.lines);
      this.renderer.render(this.scene, this.camera);
    }
    const list = this.root.querySelector('[data-chain-list]');
    list.replaceChildren();
    for (const block of [...this.visible].sort(
      (a, b) => a.height - b.height || this.lanes.get(a.hash) - this.lanes.get(b.hash)
    )) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.chainHash = block.hash;
      button.textContent = `${block.height} · ${block.hash.slice(0, 12)} · ${chainStatus(block)} · ${this.summary(block)}`;
      list.append(button);
    }
  }

  summary(block) {
    const count = block.tx_count == null ? 'count unknown' : `${block.tx_count} tx`;
    const size =
      block.size_bytes == null ? 'size unknown' : `${block.size_bytes.toLocaleString()} bytes`;
    return `${count} · ${size}`;
  }

  pick(event) {
    if (!this.mesh || !this.raycaster) return null;
    const rect = this.stage.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new this.THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      ),
      this.camera
    );
    const hit = this.raycaster.intersectObject(this.mesh)[0];
    return hit ? this.visible[hit.instanceId] : null;
  }

  select(hash) {
    this.selected = hash;
    const lane = this.lanes.get(hash) || 0;
    if (Math.abs(2 - lane * 2.5 + this.vertical) > this.stage.clientHeight / (2 * this.scale) - 1) {
      this.vertical = lane * 2.5 - 2;
    }
    window.history.replaceState(
      { view: 'chain', input: hash },
      '',
      `/${this.mod.slug}/chain/${hash}`
    );
    this.showDetails();
    this.draw();
  }

  showDetails() {
    const block = this.blocks.get(this.selected);
    if (!block) return;
    const panel = this.root.querySelector('.explorer-chain-detail');
    panel.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = `Block ${block.height} · ${chainStatus(block)}`;
    const text = document.createElement('p');
    text.textContent = `${this.summary(block)} · ${new Date(block.timestamp).toLocaleString()}`;
    const hash = document.createElement('p');
    hash.textContent = block.hash;
    const creator = document.createElement('p');
    creator.textContent = `Producer: ${block.creator}`;
    const link = document.createElement('a');
    link.className = 'explorer-link';
    link.href = `/${this.mod.slug}/block/${block.hash}`;
    link.textContent = 'Open in Explorer';
    link.onclick = (event) => {
      event.preventDefault();
      this.mod.renderBlock(block.hash);
    };
    const parent = document.createElement('button');
    parent.type = 'button';
    parent.textContent = 'Follow parent ←';
    parent.disabled = /^0+$/.test(block.parent_hash);
    parent.onclick = () => this.mod.renderChain(block.parent_hash);
    panel.append(title, text, hash, creator, link, parent);
    if (!block.body_available) {
      const note = document.createElement('p');
      note.textContent = 'Metadata retained; full block data may be unavailable.';
      panel.append(note);
    }
  }

  pan(delta, vertical = 0) {
    this.center = Math.max(1, (this.center || 1) + delta);
    this.vertical += vertical;
    this.draw();
    clearTimeout(this.panTimer);
    this.panTimer = setTimeout(() => this.refresh(false), 180);
  }

  zoom(factor) {
    this.scale = Math.max(16, Math.min(80, this.scale * factor));
    this.pan(0);
  }

  attachEvents() {
    const options = { signal: this.controller.signal };
    this.root.addEventListener(
      'click',
      (event) => {
        const hash = event.target.closest('[data-chain-hash]')?.dataset.chainHash;
        if (hash) {
          this.select(hash);
          return;
        }
        const action = event.target.closest('[data-chain-action]')?.dataset.chainAction;
        if (action === 'older') this.pan(-10);
        if (action === 'newer') this.pan(10);
        if (action === 'zoom-in') this.zoom(1.25);
        if (action === 'zoom-out') this.zoom(0.8);
        if (action === 'refresh') this.refresh();
        if (action === 'latest') this.mod.renderChain();
      },
      options
    );
    this.root.querySelector('form').addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        const value = new FormData(event.target).get('block').trim();
        if (/^(\d+|[a-f0-9]{64})$/i.test(value)) this.mod.renderChain(value);
        else this.status('Enter a block height or a 64-character block hash.');
      },
      options
    );
    this.stage.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0 || this.center == null) return;
        this.drag = { x: event.clientX, y: event.clientY, moved: 0 };
        this.stage.setPointerCapture(event.pointerId);
      },
      options
    );
    this.stage.addEventListener(
      'pointermove',
      (event) => {
        const tooltip = this.root.querySelector('.explorer-chain-tooltip');
        if (this.drag) {
          const dx = event.clientX - this.drag.x;
          const dy = event.clientY - this.drag.y;
          this.drag.moved += Math.abs(dx) + Math.abs(dy);
          this.drag.x = event.clientX;
          this.drag.y = event.clientY;
          if (this.drag.moved > 5) this.pan(-dx / (this.scale * SPACING), -dy / this.scale);
          tooltip.hidden = true;
        } else {
          const block = this.pick(event);
          tooltip.hidden = !block;
          if (block)
            tooltip.textContent = `#${block.height} · ${block.hash.slice(0, 12)} · ${this.summary(block)}`;
        }
      },
      options
    );
    this.stage.addEventListener(
      'pointerup',
      (event) => {
        if (this.drag && this.drag.moved <= 5) {
          const block = this.pick(event);
          if (block) this.select(block.hash);
        }
        this.drag = null;
        if (this.stage.hasPointerCapture(event.pointerId))
          this.stage.releasePointerCapture(event.pointerId);
      },
      options
    );
    this.stage.addEventListener(
      'pointercancel',
      () => {
        this.drag = null;
      },
      options
    );
    this.stage.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.zoom(event.deltaY > 0 ? 0.9 : 1.1);
      },
      { ...options, passive: false }
    );
    this.stage.addEventListener(
      'keydown',
      (event) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(event.key))
          event.preventDefault();
        if (event.key === 'ArrowLeft') this.pan(-3);
        if (event.key === 'ArrowRight') this.pan(3);
        if (event.key === 'ArrowUp') this.pan(0, -2.5);
        if (event.key === 'ArrowDown') this.pan(0, 2.5);
        if (event.key === '+' || event.key === '=') this.zoom(1.25);
        if (event.key === '-') this.zoom(0.8);
      },
      options
    );
  }

  cleanup() {
    this.disposed = true;
    this.controller.abort();
    clearTimeout(this.pollTimer);
    clearTimeout(this.panTimer);
    this.resizeObserver?.disconnect();
    for (const cancel of [...this.waiters]) cancel();
    this.mesh?.dispose();
    this.geometry?.dispose();
    this.material?.dispose();
    this.lines?.geometry.dispose();
    this.lineMaterial?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }
}

module.exports = ChainViewer;
