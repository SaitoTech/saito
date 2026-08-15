class Board {
  constructor(app, mod) {
    this.app = app;
    this.game_mod = mod;

    this.container = null;
    this.THREE = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.hex_geometry = null;
    this.edge_material = null;
    this.terrain_textures = {};

    this.orbit_theta = 0.36;
    this.orbit_phi = 0.66;
    this.orbit_radius = 17.5;
    this.min_radius = 9;
    this.max_radius = 23;
    this.min_phi = 0.58;
    this.max_phi = 0.8;
    this.wave_map = null;
    this.face_tokens = [];

    this.dragging = false;
    this.last_x = 0;
    this.last_y = 0;
    this.animating = false;

    this.hex_size = 1.6;
    this.tile_thickness = 0.36;
    this.demo_piece_color = 0xcbb089;
  }

  render() {
    if (!this.game_mod.gameBrowserActive()) {
      return;
    }

    this.container = document.getElementById('board');
    if (!this.container) {
      return;
    }

    if (this.renderer) {
      this.resize();
      return;
    }

    import(/* webpackIgnore: true */ '/saitoa/three.module.js').then((THREE) => {
      this.THREE = THREE;
      this.mountScene();
    });
  }

  mountScene() {
    const THREE = this.THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e4560);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 120);
    this.updateCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.container.appendChild(this.renderer.domElement);

    this.hex_geometry = this.hexPrismGeometry();
    this.edge_material = new THREE.MeshLambertMaterial({
      color: 0x5c5648,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    this.preparePropAssets();

    this.addLights();
    this.addOcean();
    this.addIsland();

    this.attachEvents();
    this.animating = true;
    this.animate();
  }

  addLights() {
    const THREE = this.THREE;

    const hemi = new THREE.HemisphereLight(0xfff1dc, 0x8a96a0, 0.84);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xfff4e6, 0.14);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffecd2, 0.4);
    sun.position.set(6, 24, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.radius = 10;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xeedcc8, 0.16);
    fill.position.set(-10, 14, -7);
    this.scene.add(fill);
  }

  addOcean() {
    const THREE = this.THREE;
    const texture = this.createOceanTexture();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.2, 2.2);
    this.wave_map = texture;

    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(56, 56, 1, 1),
      new THREE.MeshLambertMaterial({
        map: texture,
        color: 0xffffff
      })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.08;
    ocean.receiveShadow = true;
    this.scene.add(ocean);
    this.scene.background = new THREE.Color(0x1e4560);
  }

  createOceanTexture() {
    const THREE = this.THREE;
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rand = this.seeded(90210);

    ctx.fillStyle = '#1a4e78';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#163e62';
    for (let i = 0; i < 18; i++) {
      ctx.globalAlpha = 0.18 + rand() * 0.16;
      ctx.beginPath();
      ctx.ellipse(
        rand() * size,
        rand() * size,
        80 + rand() * 160,
        36 + rand() * 70,
        rand() * Math.PI,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    for (let i = 0; i < 48; i++) {
      const y = (i / 48) * size + (rand() - 0.5) * 18;
      ctx.strokeStyle = rand() > 0.55 ? '#d7e6ef' : '#2a6a94';
      ctx.globalAlpha = rand() > 0.55 ? 0.14 : 0.22;
      ctx.lineWidth = 1 + rand() * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      let x = 0;
      while (x < size) {
        const nx = x + 40 + rand() * 50;
        const ny = y + (rand() - 0.5) * 16;
        ctx.quadraticCurveTo(x + 20, y - 6 - rand() * 8, nx, ny);
        x = nx;
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }

  addIsland() {
    this.returnIslandTiles().forEach((tile) => {
      const pos = this.hexToWorld(tile.q, tile.r);
      this.addTerrainHex(tile, pos);
    });
    this.addCoastline();
    this.addNumberTokens();
    this.addPorts();
    this.addDemoPieces();
  }

  edgeNeighbor(edge) {
    return [
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
      [1, 0]
    ][edge];
  }

  islandKeys() {
    const keys = {};
    this.returnIslandTiles().forEach((tile) => {
      keys[tile.q + ',' + tile.r] = true;
    });
    return keys;
  }

  pointKey(x, z) {
    return x.toFixed(4) + ',' + z.toFixed(4);
  }

  collectIslandLoop() {
    const keys = this.islandKeys();
    const edges = [];
    this.returnIslandTiles().forEach((tile) => {
      for (let e = 0; e < 6; e++) {
        const n = this.edgeNeighbor(e);
        if (!keys[tile.q + n[0] + ',' + (tile.r + n[1])]) {
          const edge = this.hexEdge(tile.q, tile.r, e);
          edges.push({
            ax: edge.a.x,
            az: edge.a.z,
            bx: edge.b.x,
            bz: edge.b.z
          });
        }
      }
    });

    const unused = edges.slice();
    const loop = [{ x: unused[0].ax, z: unused[0].az }];
    let x = unused[0].bx;
    let z = unused[0].bz;
    unused.shift();

    while (unused.length) {
      loop.push({ x, z });
      let found = -1;
      let reverse = false;
      for (let i = 0; i < unused.length; i++) {
        const e = unused[i];
        if (Math.hypot(e.ax - x, e.az - z) < 0.02) {
          found = i;
          reverse = false;
          break;
        }
        if (Math.hypot(e.bx - x, e.bz - z) < 0.02) {
          found = i;
          reverse = true;
          break;
        }
      }
      if (found < 0) {
        break;
      }
      const e = unused.splice(found, 1)[0];
      if (reverse) {
        x = e.ax;
        z = e.az;
      } else {
        x = e.bx;
        z = e.bz;
      }
      if (Math.hypot(x - loop[0].x, z - loop[0].z) < 0.02) {
        break;
      }
    }
    return loop;
  }

  densifyLoop(loop, cuts) {
    const out = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      out.push(a);
      for (let c = 1; c <= cuts; c++) {
        const t = c / (cuts + 1);
        out.push({
          x: a.x + (b.x - a.x) * t,
          z: a.z + (b.z - a.z) * t
        });
      }
    }
    return out;
  }

  offsetLoop(loop, dist, rand) {
    const n = loop.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = loop[(i + n - 1) % n];
      const cur = loop[i];
      const nxt = loop[(i + 1) % n];
      const e1x = cur.x - prev.x;
      const e1z = cur.z - prev.z;
      const e2x = nxt.x - cur.x;
      const e2z = nxt.z - cur.z;
      let nx = e1z + e2z;
      let nz = -(e1x + e2x);
      const len = Math.hypot(nx, nz) || 1;
      nx /= len;
      nz /= len;
      const d = dist * (0.9 + rand() * 0.2);
      out.push({ x: cur.x + nx * d, z: cur.z + nz * d });
    }
    return out;
  }

  ribbonGeometry(inner, outer, y_inner, y_outer) {
    const THREE = this.THREE;
    const positions = [];
    const normals = [];
    const uvs = [];
    const n = inner.length;

    const addTriangle = (ax, ay, az, bx, by, bz, cx, cy, cz, u1, v1, u2, v2, u3, v3) => {
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      let nx = aby * acz - abz * acy;
      let ny = abz * acx - abx * acz;
      let nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      uvs.push(u1, v1, u2, v2, u3, v3);
    };

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = inner[i];
      const b = inner[j];
      const c = outer[j];
      const d = outer[i];
      const u0 = i / n;
      const u1 = (i + 1) / n;
      addTriangle(a.x, y_inner, a.z, b.x, y_inner, b.z, c.x, y_outer, c.z, u0, 0, u1, 0, u1, 1);
      addTriangle(a.x, y_inner, a.z, c.x, y_outer, c.z, d.x, y_outer, d.z, u0, 0, u1, 1, u0, 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geo;
  }

  createBandTexture(fill, ink, grain) {
    const THREE = this.THREE;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rand = this.seeded(fill.length * 999 + grain);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = grain;
    for (let i = 0; i < 400; i++) {
      ctx.globalAlpha = 0.04 + rand() * 0.06;
      ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
    }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 20 + i * 22 + rand() * 6);
      ctx.lineTo(size, 16 + i * 22 + rand() * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  addCoastline() {
    const THREE = this.THREE;
    const rand = this.seeded(4242);
    const core = this.densifyLoop(this.collectIslandLoop(), 2);
    const cover = this.offsetLoop(core, 0.03, rand);
    const beach = this.offsetLoop(core, 0.26, rand);
    const cliff = this.offsetLoop(core, 0.38, rand);
    const shallow = this.offsetLoop(core, 0.78, rand);
    const y_top = this.tile_thickness;

    const sand_map = this.createBandTexture('#d7c49a', '#6a5840', '#fff6e0');
    const cliff_map = this.createBandTexture('#b0895c', '#5a4434', '#e8d2b0');
    const shallow_map = this.createBandTexture('#2d6f96', '#1a4664', '#d8eef8');

    const cover_mesh = new THREE.Mesh(
      this.ribbonGeometry(core, cover, y_top, 0.16),
      new THREE.MeshLambertMaterial({ map: sand_map })
    );
    cover_mesh.castShadow = true;
    cover_mesh.receiveShadow = true;
    this.scene.add(cover_mesh);

    const beach_mesh = new THREE.Mesh(
      this.ribbonGeometry(cover, beach, 0.16, 0.07),
      new THREE.MeshLambertMaterial({ map: sand_map })
    );
    beach_mesh.castShadow = true;
    beach_mesh.receiveShadow = true;
    this.scene.add(beach_mesh);

    const cliff_mesh = new THREE.Mesh(
      this.ribbonGeometry(beach, cliff, 0.07, -0.04),
      new THREE.MeshLambertMaterial({ map: cliff_map })
    );
    cliff_mesh.castShadow = true;
    cliff_mesh.receiveShadow = true;
    this.scene.add(cliff_mesh);

    const shallow_mesh = new THREE.Mesh(
      this.ribbonGeometry(cliff, shallow, -0.05, -0.07),
      new THREE.MeshLambertMaterial({
        map: shallow_map,
        transparent: true,
        opacity: 0.92
      })
    );
    shallow_mesh.receiveShadow = true;
    this.scene.add(shallow_mesh);

    const ink = [];
    beach.forEach((p) => ink.push(p.x, 0.075, p.z));
    ink.push(beach[0].x, 0.075, beach[0].z);
    const ink_geo = new THREE.BufferGeometry();
    ink_geo.setAttribute('position', new THREE.Float32BufferAttribute(ink, 3));
    this.scene.add(
      new THREE.Line(
        ink_geo,
        new THREE.LineBasicMaterial({ color: 0x4a4034, transparent: true, opacity: 0.55 })
      )
    );

    const shape = new THREE.Shape(core.map((p) => new THREE.Vector2(p.x, p.z)));
    const blob = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: 0x0c2438,
        transparent: true,
        opacity: 0.12,
        depthWrite: false
      })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = -0.06;
    blob.scale.set(1.06, 1.06, 1);
    this.scene.add(blob);
  }

  pipCount(number) {
    return 6 - Math.abs(number - 7);
  }

  createTokenFace(number) {
    const THREE = this.THREE;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fillStyle = '#f3ead4';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#3a342c';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#c4b49a';
    ctx.stroke();

    const hot = number === 6 || number === 8;
    ctx.fillStyle = hot ? '#c42a22' : '#2a2622';
    ctx.font = 'bold 118px Georgia, Times New Roman, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 128, 112);

    const pips = this.pipCount(number);
    const pip_y = 188;
    const spacing = 16;
    const start = 128 - ((pips - 1) * spacing) / 2;
    ctx.fillStyle = hot ? '#c42a22' : '#3a342c';
    for (let i = 0; i < pips; i++) {
      ctx.beginPath();
      ctx.arc(start + i * spacing, pip_y, hot ? 5.5 : 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.needsUpdate = true;
    return texture;
  }

  addNumberTokens() {
    const numbers = [
      10, 2, 9, 12, 6, 4, 10, 9, 11, 0, 3, 8, 8, 3, 4, 5, 5, 6, 11
    ];
    this.returnIslandTiles().forEach((tile, i) => {
      if (tile.terrain === 'desert') {
        return;
      }
      this.addNumberToken(tile.q, tile.r, numbers[i]);
    });
  }

  addNumberToken(q, r, number) {
    const THREE = this.THREE;
    const pos = this.hexToWorld(q, r);
    const group = new THREE.Group();
    group.position.set(pos.x, this.tile_thickness + 0.006, pos.z);

    const body_geo = new THREE.CylinderGeometry(0.27, 0.27, 0.04, 28);
    const body = new THREE.Mesh(
      body_geo,
      new THREE.MeshLambertMaterial({ color: 0xe8dcc4 })
    );
    body.position.y = 0.02;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 28),
      new THREE.MeshLambertMaterial({ map: this.createTokenFace(number) })
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.042;
    group.add(face);

    this.scene.add(group);
    this.face_tokens.push(group);
  }

  returnPorts() {
    return [
      { q: 0, r: -2, e: 3, ratio: '3:1' },
      { q: 1, r: -2, e: 4, ratio: '2:1' },
      { q: 2, r: -1, e: 5, ratio: '3:1' },
      { q: 2, r: 0, e: 0, ratio: '2:1' },
      { q: 1, r: 1, e: 0, ratio: '3:1' },
      { q: 0, r: 2, e: 1, ratio: '2:1' },
      { q: -2, r: 2, e: 2, ratio: '3:1' },
      { q: -2, r: 1, e: 2, ratio: '2:1' },
      { q: -2, r: 0, e: 3, ratio: '2:1' }
    ];
  }

  edgeOutward(q, r, edge) {
    const seg = this.hexEdge(q, r, edge);
    const mx = (seg.a.x + seg.b.x) / 2;
    const mz = (seg.a.z + seg.b.z) / 2;
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    let nx = dz;
    let nz = -dx;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    const c = this.hexToWorld(q, r);
    if ((mx - c.x) * nx + (mz - c.z) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { mx, mz, nx, nz, dx, dz };
  }

  createPortSign(ratio) {
    const THREE = this.THREE;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#efe4cc';
    ctx.fillRect(8, 18, 112, 92);
    ctx.strokeStyle = '#3a342c';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 18, 112, 92);
    ctx.fillStyle = '#2a2622';
    ctx.font = 'bold 48px Georgia, Times New Roman, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ratio, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.needsUpdate = true;
    return texture;
  }

  addPorts() {
    this.returnPorts().forEach((port) => this.addPort(port));
  }

  addPort(port) {
    const THREE = this.THREE;
    const out = this.edgeOutward(port.q, port.r, port.e);
    const group = new THREE.Group();
    const dock_len = 0.72;
    const origin_x = out.mx + out.nx * 0.18;
    const origin_z = out.mz + out.nz * 0.18;
    group.position.set(origin_x, 0.1, origin_z);
    group.rotation.y = Math.atan2(out.nx, out.nz);

    const mats = this.pieceMaterials(0xb08958);
    const dock_geo = new THREE.BoxGeometry(0.18, 0.04, dock_len);
    const dock = new THREE.Mesh(dock_geo, mats.road);
    dock.position.set(0, 0, dock_len / 2);
    dock.castShadow = true;
    dock.receiveShadow = true;
    group.add(dock);

    for (const z of [0.12, dock_len - 0.08]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.026, 0.18, 6),
        mats.trim
      );
      post.position.set(0.06, -0.06, z);
      group.add(post);
    }

    const hut_geo = new THREE.BoxGeometry(0.13, 0.09, 0.11);
    const hut = new THREE.Mesh(hut_geo, mats.wall);
    hut.position.set(0, 0.065, dock_len - 0.18);
    hut.castShadow = true;
    group.add(hut);
    group.add(this.addInkShell(hut, hut_geo, 1.06));

    const hut_roof = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 4), mats.roof);
    hut_roof.position.set(0, 0.135, dock_len - 0.18);
    hut_roof.rotation.y = Math.PI / 4;
    group.add(hut_roof);

    const boat = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x6a4330 })
    );
    boat.scale.set(1.5, 0.42, 0.75);
    boat.position.set(-0.15, -0.06, dock_len * 0.55);
    group.add(boat);

    const sign_group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.016, 0.22, 6),
      mats.trim
    );
    pole.position.y = 0.11;
    sign_group.add(pole);

    const board_geo = new THREE.PlaneGeometry(0.22, 0.16);
    const board = new THREE.Mesh(
      board_geo,
      new THREE.MeshLambertMaterial({ map: this.createPortSign(port.ratio) })
    );
    board.position.y = 0.24;
    sign_group.add(board);
    const back = new THREE.Mesh(
      board_geo,
      new THREE.MeshLambertMaterial({ color: 0x5a4434 })
    );
    back.position.y = 0.24;
    back.rotation.y = Math.PI;
    sign_group.add(back);

    sign_group.position.set(
      origin_x + out.nx * dock_len * 0.38,
      0.12,
      origin_z + out.nz * dock_len * 0.38
    );
    this.scene.add(sign_group);
    this.face_tokens.push(sign_group);

    this.scene.add(group);
  }

  returnIslandTiles() {
    return [
      { q: 0, r: -2, terrain: 'mountains' },
      { q: 1, r: -2, terrain: 'pasture' },
      { q: 2, r: -2, terrain: 'forest' },
      { q: -1, r: -1, terrain: 'fields' },
      { q: 0, r: -1, terrain: 'hills' },
      { q: 1, r: -1, terrain: 'pasture' },
      { q: 2, r: -1, terrain: 'hills' },
      { q: -2, r: 0, terrain: 'fields' },
      { q: -1, r: 0, terrain: 'forest' },
      { q: 0, r: 0, terrain: 'desert' },
      { q: 1, r: 0, terrain: 'forest' },
      { q: 2, r: 0, terrain: 'mountains' },
      { q: -2, r: 1, terrain: 'forest' },
      { q: -1, r: 1, terrain: 'mountains' },
      { q: 0, r: 1, terrain: 'fields' },
      { q: 1, r: 1, terrain: 'pasture' },
      { q: -2, r: 2, terrain: 'hills' },
      { q: -1, r: 2, terrain: 'fields' },
      { q: 0, r: 2, terrain: 'pasture' }
    ];
  }

  hexVertex(q, r, vertex) {
    const center = this.hexToWorld(q, r);
    const angle = Math.PI / 6 + vertex * (Math.PI / 3);
    return {
      x: center.x + this.hex_size * Math.cos(angle),
      z: center.z + this.hex_size * Math.sin(angle)
    };
  }

  hexEdge(q, r, edge) {
    return {
      a: this.hexVertex(q, r, edge),
      b: this.hexVertex(q, r, (edge + 1) % 6)
    };
  }

  hexToWorld(q, r) {
    const size = this.hex_size;
    return {
      x: size * Math.sqrt(3) * (q + r / 2),
      z: size * 1.5 * r
    };
  }

  hexPrismGeometry() {
    const THREE = this.THREE;
    const radius = this.hex_size;
    const height = this.tile_thickness;
    const positions = [];
    const normals = [];

    const corners = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      corners.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }

    const addTriangle = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      let nx = aby * acz - abz * acy;
      let ny = abz * acx - abx * acz;
      let nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    };

    for (let i = 1; i < 5; i++) {
      addTriangle(
        corners[0][0],
        height,
        corners[0][1],
        corners[i + 1][0],
        height,
        corners[i + 1][1],
        corners[i][0],
        height,
        corners[i][1]
      );
    }

    for (let i = 1; i < 5; i++) {
      addTriangle(
        corners[0][0],
        0,
        corners[0][1],
        corners[i][0],
        0,
        corners[i][1],
        corners[i + 1][0],
        0,
        corners[i + 1][1]
      );
    }

    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const ax = corners[i][0];
      const az = corners[i][1];
      const bx = corners[j][0];
      const bz = corners[j][1];
      addTriangle(ax, 0, az, bx, 0, bz, bx, height, bz);
      addTriangle(ax, 0, az, bx, height, bz, ax, height, az);
    }

    const uvs = [];
    const uv_width = radius * Math.sqrt(3);
    const uv_height = radius * 2;
    for (let i = 0; i < positions.length; i += 3) {
      uvs.push(positions[i] / uv_width + 0.5, positions[i + 2] / uv_height + 0.5);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    const top_count = 12;
    const bottom_count = 12;
    const side_count = 36;
    geo.addGroup(0, top_count, 0);
    geo.addGroup(top_count, bottom_count + side_count, 1);

    return geo;
  }

  terrainColor(terrain) {
    const colors = {
      forest: 0x2f6b3a,
      pasture: 0x7cb86a,
      fields: 0xd4b44a,
      hills: 0xa45a3a,
      mountains: 0x8a8f97,
      desert: 0xd2b48c
    };
    return colors[terrain] || 0x889988;
  }

  terrainPalette(terrain) {
    const palettes = {
      forest: { fill: '#2f6b3a', ink: '#3d3830', mark: '#2f5640', light: '#548a58' },
      pasture: { fill: '#7cb86a', ink: '#3d3830', mark: '#6e9a58', light: '#a8c484' },
      fields: { fill: '#d4b44a', ink: '#4a4030', mark: '#c09840', light: '#dcc46a' },
      hills: { fill: '#a45a3a', ink: '#4a3830', mark: '#a8583c', light: '#d0805c' },
      mountains: { fill: '#8a8f97', ink: '#3c3c42', mark: '#747880', light: '#a2a6ac' },
      desert: { fill: '#d2b48c', ink: '#4a4034', mark: '#c4a478', light: '#e0c8a4' }
    };
    return palettes[terrain] || palettes.pasture;
  }

  seeded(seed) {
    let t = (seed >>> 0) + 0x6d2b79f5;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  hexCanvasPoint(size, angle) {
    const radius = this.hex_size;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    return {
      x: (x / (radius * Math.sqrt(3)) + 0.5) * size,
      y: (z / (radius * 2) + 0.5) * size
    };
  }

  hexOutlinePoints(size, rand) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const p = this.hexCanvasPoint(size, Math.PI / 6 + i * (Math.PI / 3));
      pts.push({
        x: p.x + (rand() - 0.5) * 1.2,
        y: p.y + (rand() - 0.5) * 1.2
      });
    }
    return pts;
  }

  traceHex(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  }

  paintPaper(ctx, size, rand, tint) {
    ctx.fillStyle = tint;
    for (let i = 0; i < 900; i++) {
      ctx.globalAlpha = 0.03 + rand() * 0.04;
      ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 1.5, 1 + rand() * 1.5);
    }
    ctx.globalAlpha = 1;
  }

  paintForestMarks(ctx, size, rand, palette) {
    const count = 11 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const x = size * (0.22 + rand() * 0.56);
      const y = size * (0.22 + rand() * 0.56);
      const s = 7 + rand() * 11;
      ctx.fillStyle = rand() > 0.45 ? palette.mark : palette.light;
      ctx.globalAlpha = 0.28 + rand() * 0.18;
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.72, rand() * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + s * 0.35, y + s * 0.08, s * 0.62, s * 0.5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.55, 0.2, Math.PI * 1.1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  paintPastureMarks(ctx, size, rand, palette) {
    ctx.strokeStyle = palette.mark;
    ctx.lineWidth = 1;
    for (let i = 0; i < 28; i++) {
      const x = size * (0.2 + rand() * 0.6);
      const y = size * (0.2 + rand() * 0.6);
      ctx.globalAlpha = 0.18 + rand() * 0.12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 4, y - 5 - rand() * 4, x + 2 + rand() * 3, y - 8 - rand() * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  paintFieldsMarks(ctx, size, rand, palette) {
    ctx.strokeStyle = palette.mark;
    ctx.lineWidth = 1.1;
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const y = size * (0.28 + i * 0.07);
      ctx.globalAlpha = 0.16 + rand() * 0.1;
      ctx.beginPath();
      ctx.moveTo(size * 0.22, y + (rand() - 0.5) * 3);
      ctx.lineTo(size * 0.78, y + (rand() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  paintHillsMarks(ctx, size, rand, palette) {
    ctx.strokeStyle = palette.mark;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 8; i++) {
      const x = size * (0.28 + rand() * 0.44);
      const y = size * (0.3 + rand() * 0.4);
      ctx.globalAlpha = 0.2 + rand() * 0.12;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.quadraticCurveTo(x, y - 6 - rand() * 4, x + 10, y + (rand() - 0.5) * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  paintMountainsMarks(ctx, size, rand, palette) {
    ctx.strokeStyle = palette.mark;
    ctx.lineWidth = 1.05;
    for (let i = 0; i < 9; i++) {
      const x = size * (0.26 + rand() * 0.48);
      const y = size * (0.28 + rand() * 0.44);
      ctx.globalAlpha = 0.18 + rand() * 0.12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6 + rand() * 8, y + 3 + rand() * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  paintDesertMarks(ctx, size, rand, palette) {
    ctx.strokeStyle = palette.mark;
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const x = size * (0.24 + rand() * 0.52);
      const y = size * (0.28 + rand() * 0.44);
      ctx.globalAlpha = 0.16 + rand() * 0.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 8, y - 2, x + 16 + rand() * 6, y + (rand() - 0.5));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  createTerrainTexture(terrain, q, r) {
    const THREE = this.THREE;
    const key = terrain + '_' + q + '_' + r;
    if (this.terrain_textures[key]) {
      return this.terrain_textures[key];
    }

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rand = this.seeded((q + 11) * 73856093 ^ (r + 19) * 19349663 ^ terrain.length * 83492791);
    const palette = this.terrainPalette(terrain);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    const outline = this.hexOutlinePoints(size, rand);
    this.traceHex(ctx, outline);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = palette.fill;
    ctx.fill();
    this.paintPaper(ctx, size, rand, '#fff8e8');

    if (terrain === 'forest') {
      this.paintForestMarks(ctx, size, rand, palette);
    } else if (terrain === 'pasture') {
      this.paintPastureMarks(ctx, size, rand, palette);
    } else if (terrain === 'fields') {
      this.paintFieldsMarks(ctx, size, rand, palette);
    } else if (terrain === 'hills') {
      this.paintHillsMarks(ctx, size, rand, palette);
    } else if (terrain === 'mountains') {
      this.paintMountainsMarks(ctx, size, rand, palette);
    } else {
      this.paintDesertMarks(ctx, size, rand, palette);
    }
    ctx.restore();

    this.traceHex(ctx, outline);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 4.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.62;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.terrain_textures[key] = texture;
    return texture;
  }

  addTerrainHex(tile, pos) {
    const THREE = this.THREE;
    const top_mat = new THREE.MeshLambertMaterial({
      map: this.createTerrainTexture(tile.terrain, tile.q, tile.r),
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    const hex = new THREE.Mesh(this.hex_geometry, [top_mat, this.edge_material]);
    hex.position.set(pos.x, 0, pos.z);
    hex.castShadow = true;
    hex.receiveShadow = true;
    this.scene.add(hex);
    this.addTerrainProps(tile, pos);
  }

  preparePropAssets() {
    const THREE = this.THREE;
    const lathe = (pts, segs) =>
      new THREE.LatheGeometry(
        pts.map((p) => new THREE.Vector2(p[0], p[1])),
        segs
      );

    this.tree_geos = [
      lathe(
        [
          [0.01, 0],
          [0.2, 0.04],
          [0.26, 0.14],
          [0.22, 0.26],
          [0.12, 0.34],
          [0, 0.38]
        ],
        12
      ),
      lathe(
        [
          [0.01, 0],
          [0.14, 0.03],
          [0.18, 0.12],
          [0.13, 0.26],
          [0.07, 0.4],
          [0, 0.48]
        ],
        12
      ),
      lathe(
        [
          [0.01, 0],
          [0.28, 0.03],
          [0.3, 0.12],
          [0.16, 0.2],
          [0, 0.24]
        ],
        12
      )
    ];

    this.tree_mats = [
      new THREE.MeshLambertMaterial({ color: 0x355e3c }),
      new THREE.MeshLambertMaterial({ color: 0x3d7044 }),
      new THREE.MeshLambertMaterial({ color: 0x2a4e32 })
    ];
    this.trunk_geo = new THREE.CylinderGeometry(0.025, 0.032, 0.11, 6);
    this.trunk_mat = new THREE.MeshLambertMaterial({ color: 0x5a4330 });
    this.ink_mat = new THREE.MeshBasicMaterial({
      color: 0x3d3830,
      side: THREE.BackSide
    });
    this.sheep_body_mat = new THREE.MeshLambertMaterial({ color: 0xf3efe4 });
    this.sheep_head_mat = new THREE.MeshLambertMaterial({ color: 0x3d342c });
    this.wheat_mats = [
      new THREE.MeshLambertMaterial({ color: 0xd4b44a }),
      new THREE.MeshLambertMaterial({ color: 0xc49a38 }),
      new THREE.MeshLambertMaterial({ color: 0xe0c56a })
    ];
    this.wheat_geo = new THREE.BoxGeometry(0.018, 0.16, 0.012);
    this.hill_mats = [
      new THREE.MeshLambertMaterial({ color: 0xc46a45 }),
      new THREE.MeshLambertMaterial({ color: 0xa85838 })
    ];
    this.rock_mat = new THREE.MeshLambertMaterial({ color: 0x8b9098 });
    this.rock_dark_mat = new THREE.MeshLambertMaterial({ color: 0x6f747c });
    this.snow_mat = new THREE.MeshLambertMaterial({ color: 0xf2f0ea });
    this.desert_rock_mat = new THREE.MeshLambertMaterial({ color: 0xb89a72 });
    this.wood_map = this.createWoodTexture();
    this.piece_mat_cache = {};
  }

  createWoodTexture() {
    const THREE = this.THREE;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rand = this.seeded(771);
    ctx.fillStyle = '#e8d5b8';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = rand() > 0.5 ? '#c4a882' : '#d8c4a0';
      ctx.globalAlpha = 0.35 + rand() * 0.3;
      ctx.lineWidth = 1 + rand() * 2;
      const y = i * 7 + rand() * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(40, y + 2, 80, y - 2, size, y + (rand() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  pieceMaterials(color) {
    const THREE = this.THREE;
    const key = color;
    if (this.piece_mat_cache[key]) {
      return this.piece_mat_cache[key];
    }
    const mats = {
      road: new THREE.MeshLambertMaterial({ color, map: this.wood_map }),
      wall: new THREE.MeshLambertMaterial({ color }),
      roof: new THREE.MeshLambertMaterial({ color: 0x8f4a3c }),
      trim: new THREE.MeshLambertMaterial({ color: 0x4a3830 }),
      light: new THREE.MeshLambertMaterial({ color: 0xf0e6d0 })
    };
    this.piece_mat_cache[key] = mats;
    return mats;
  }

  hexPropSpot(rand, occupied, min_dist) {
    for (let i = 0; i < 16; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 0.68 + rand() * 0.38;
      const p = { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad };
      if (occupied.every((o) => Math.hypot(p.x - o.x, p.z - o.z) >= min_dist)) {
        occupied.push(p);
        return p;
      }
    }
    const fallback = {
      x: Math.cos(rand() * 6.28) * 0.7,
      z: Math.sin(rand() * 6.28) * 0.7
    };
    occupied.push(fallback);
    return fallback;
  }

  addInkShell(mesh, geo, factor) {
    const shell = new this.THREE.Mesh(geo, this.ink_mat);
    shell.position.copy(mesh.position);
    shell.rotation.copy(mesh.rotation);
    shell.scale.copy(mesh.scale);
    shell.scale.multiplyScalar(factor || 1.07);
    return shell;
  }

  addTerrainProps(tile, pos) {
    const rand = this.seeded((tile.q + 5) * 83492791 ^ (tile.r + 13) * 73856093);
    const occupied = [];
    if (tile.terrain === 'forest') {
      this.addForestGrove(pos, rand, occupied);
    } else if (tile.terrain === 'pasture') {
      this.addPastureFlock(pos, rand, occupied);
    } else if (tile.terrain === 'fields') {
      this.addWheatPatches(pos, rand, occupied);
    } else if (tile.terrain === 'hills') {
      this.addHillocks(pos, rand, occupied);
    } else if (tile.terrain === 'mountains') {
      this.addMountainGroup(pos, rand, occupied);
    } else if (tile.terrain === 'desert') {
      this.addDesertRocks(pos, rand, occupied);
    }
  }

  addForestGrove(pos, rand, occupied) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const spot = this.hexPropSpot(rand, occupied, 0.34);
      const kind = i % 3;
      const scale = 0.72 + rand() * 0.22;
      this.addTree(pos.x + spot.x, pos.z + spot.z, kind, scale, rand);
    }
  }

  addTree(x, z, kind, scale, rand) {
    const THREE = this.THREE;
    const y0 = this.tile_thickness;
    const group = new THREE.Group();
    group.position.set(x, y0, z);
    group.rotation.y = rand() * Math.PI * 2;

    const trunk = new THREE.Mesh(this.trunk_geo, this.trunk_mat);
    trunk.scale.setScalar(scale);
    trunk.position.y = 0.055 * scale;
    trunk.castShadow = true;
    group.add(trunk);

    const geo = this.tree_geos[kind];
    const canopy = new THREE.Mesh(geo, this.tree_mats[kind]);
    canopy.scale.setScalar(scale);
    canopy.position.y = 0.1 * scale;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    group.add(canopy);
    const ink = this.addInkShell(canopy, geo, 1.05);
    group.add(ink);
    this.scene.add(group);
  }

  addPastureFlock(pos, rand, occupied) {
    const count = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const spot = this.hexPropSpot(rand, occupied, 0.38);
      this.addSheep(pos.x + spot.x, pos.z + spot.z, rand);
    }
  }

  addSheep(x, z, rand) {
    const THREE = this.THREE;
    const y0 = this.tile_thickness;
    const group = new THREE.Group();
    group.position.set(x, y0, z);
    group.rotation.y = rand() * Math.PI * 2;
    const s = 0.85 + rand() * 0.25;
    group.scale.setScalar(s);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), this.sheep_body_mat);
    body.scale.set(1.35, 0.9, 1.05);
    body.position.y = 0.08;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), this.sheep_head_mat);
    head.position.set(0, 0.09, 0.1);
    head.scale.set(0.9, 0.85, 1.15);
    group.add(head);

    for (let i = 0; i < 2; i++) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), this.sheep_head_mat);
      ear.position.set(i === 0 ? -0.028 : 0.028, 0.118, 0.088);
      ear.scale.set(1.4, 0.7, 0.6);
      group.add(ear);
    }

    const leg_geo = new THREE.CylinderGeometry(0.01, 0.012, 0.055, 5);
    const legs = [
      [-0.04, 0.028, 0.035],
      [0.04, 0.028, 0.035],
      [-0.04, 0.028, -0.04],
      [0.04, 0.028, -0.04]
    ];
    legs.forEach((p) => {
      const leg = new THREE.Mesh(leg_geo, this.sheep_head_mat);
      leg.position.set(p[0], p[1], p[2]);
      group.add(leg);
    });

    this.scene.add(group);
  }

  addWheatPatches(pos, rand, occupied) {
    const patches = 3;
    for (let p = 0; p < patches; p++) {
      const spot = this.hexPropSpot(rand, occupied, 0.42);
      this.addWheatCluster(pos.x + spot.x, pos.z + spot.z, rand);
    }
  }

  addWheatCluster(x, z, rand) {
    const THREE = this.THREE;
    const y0 = this.tile_thickness;
    const group = new THREE.Group();
    group.position.set(x, y0, z);
    group.rotation.y = rand() * Math.PI * 2;
    const stalks = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < stalks; i++) {
      const stalk = new THREE.Mesh(this.wheat_geo, this.wheat_mats[i % 3]);
      const ox = (rand() - 0.5) * 0.15;
      const oz = (rand() - 0.5) * 0.11;
      const h = 0.65 + rand() * 0.3;
      stalk.position.set(ox, 0.08 * h, oz);
      stalk.scale.set(1, h, 1);
      stalk.rotation.z = (rand() - 0.5) * 0.22;
      stalk.rotation.x = (rand() - 0.5) * 0.12;
      group.add(stalk);
    }
    this.scene.add(group);
  }

  addHillocks(pos, rand, occupied) {
    const count = 2;
    for (let i = 0; i < count; i++) {
      const spot = this.hexPropSpot(rand, occupied, 0.42);
      this.addHillock(pos.x + spot.x, pos.z + spot.z, i, rand);
    }
  }

  addHillock(x, z, index, rand) {
    const THREE = this.THREE;
    const y0 = this.tile_thickness;
    const geo = new THREE.SphereGeometry(0.22, 10, 8);
    const mesh = new THREE.Mesh(geo, this.hill_mats[index % 2]);
    const sx = 0.85 + rand() * 0.45;
    const sy = 0.28 + rand() * 0.12;
    const sz = 0.7 + rand() * 0.35;
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y0 + 0.22 * sy * 0.55, z);
    mesh.rotation.y = rand() * Math.PI;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  addMountainGroup(pos, rand, occupied) {
    const count = 2;
    for (let i = 0; i < count; i++) {
      const spot = this.hexPropSpot(rand, occupied, 0.42);
      const h = 0.38 + rand() * 0.16 + (i === 0 ? 0.06 : 0);
      const w = 0.26 + rand() * 0.1;
      this.addMountain(pos.x + spot.x, pos.z + spot.z, w, h, rand);
    }
  }

  mountainGeometry(width, height, rand) {
    const THREE = this.THREE;
    const positions = [];
    const normals = [];
    const peak = [(rand() - 0.5) * width * 0.18, height, (rand() - 0.5) * width * 0.14];
    const n = 5;
    const base = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const rx = width * (0.72 + rand() * 0.28);
      const rz = width * (0.62 + rand() * 0.28);
      base.push([Math.cos(ang) * rx, 0, Math.sin(ang) * rz]);
    }
    const addTriangle = (a, b, c) => {
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const abz = b[2] - a[2];
      const acx = c[0] - a[0];
      const acy = c[1] - a[1];
      const acz = c[2] - a[2];
      let nx = aby * acz - abz * acy;
      let ny = abz * acx - abx * acz;
      let nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    };
    for (let i = 0; i < n; i++) {
      addTriangle(peak, base[i], base[(i + 1) % n]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return { geo, peak };
  }

  addMountain(x, z, width, height, rand) {
    const THREE = this.THREE;
    const y0 = this.tile_thickness;
    const { geo, peak } = this.mountainGeometry(width, height, rand);
    const mesh = new THREE.Mesh(geo, rand() > 0.5 ? this.rock_mat : this.rock_dark_mat);
    mesh.position.set(x, y0, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.scene.add(this.addInkShell(mesh, geo, 1.04));

    const snow = new THREE.Mesh(
      new THREE.ConeGeometry(width * 0.22, height * 0.22, 5),
      this.snow_mat
    );
    snow.position.set(x + peak[0] * 0.15, y0 + height * 0.86, z + peak[2] * 0.15);
    this.scene.add(snow);
  }

  addDesertRocks(pos, rand, occupied) {
    const THREE = this.THREE;
    const count = 2;
    for (let i = 0; i < count; i++) {
      const spot = this.hexPropSpot(rand, occupied, 0.45);
      const geo = new THREE.SphereGeometry(0.08 + rand() * 0.04, 7, 6);
      const rock = new THREE.Mesh(geo, this.desert_rock_mat);
      rock.scale.set(1 + rand() * 0.5, 0.35 + rand() * 0.2, 0.8 + rand() * 0.4);
      rock.position.set(pos.x + spot.x, this.tile_thickness + 0.01, pos.z + spot.z);
      rock.rotation.y = rand() * Math.PI;
      rock.castShadow = true;
      this.scene.add(rock);
    }
  }

  addDemoPieces() {
    const color = this.demo_piece_color;
    const roads = [
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 5],
      [1, 0, 2],
      [1, 0, 3],
      [0, -1, 3],
      [0, -1, 4],
      [-1, 0, 0],
      [-1, 0, 5],
      [0, 1, 1]
    ];
    roads.forEach((p) => this.addRoad(p[0], p[1], p[2], color));

    const settlements = [
      [0, 0, 0],
      [0, 0, 2],
      [1, -1, 4],
      [0, 1, 3],
      [-1, 0, 4]
    ];
    settlements.forEach((p) => this.addSettlement(p[0], p[1], p[2], color));

    const cities = [
      [1, 0, 1],
      [-1, 1, 2],
      [0, -2, 3]
    ];
    cities.forEach((p) => this.addCity(p[0], p[1], p[2], color));
  }

  addRoad(q, r, edge, color) {
    const THREE = this.THREE;
    const seg = this.hexEdge(q, r, edge);
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const length = Math.hypot(dx, dz) * 0.64;
    const mats = this.pieceMaterials(color);
    const group = new THREE.Group();
    group.position.set((seg.a.x + seg.b.x) / 2, this.tile_thickness, (seg.a.z + seg.b.z) / 2);
    group.rotation.y = Math.atan2(dx, dz);

    const plank_geo = new THREE.BoxGeometry(0.1, 0.036, length);
    const plank = new THREE.Mesh(plank_geo, mats.road);
    plank.position.y = 0.018;
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
    group.add(this.addInkShell(plank, plank_geo, 1.05));

    const groove = new THREE.BoxGeometry(0.007, 0.005, length * 0.9);
    for (const x of [-0.024, 0.024]) {
      const line = new THREE.Mesh(groove, mats.trim);
      line.position.set(x, 0.038, 0);
      group.add(line);
    }

    const cap_geo = new THREE.CylinderGeometry(0.05, 0.05, 0.036, 8);
    [-length / 2, length / 2].forEach((z) => {
      const cap = new THREE.Mesh(cap_geo, mats.road);
      cap.position.set(0, 0.018, z);
      group.add(cap);
    });

    this.scene.add(group);
  }

  addSettlement(q, r, vertex, color) {
    const THREE = this.THREE;
    const v = this.hexVertex(q, r, vertex);
    const mats = this.pieceMaterials(color);
    const group = new THREE.Group();
    group.position.set(v.x, this.tile_thickness, v.z);
    group.rotation.y = vertex * (Math.PI / 3);
    group.scale.setScalar(0.82);
    const wall_geo = new THREE.BoxGeometry(0.18, 0.12, 0.15);
    const walls = new THREE.Mesh(wall_geo, mats.wall);
    walls.position.y = 0.06;
    walls.castShadow = true;
    group.add(walls);
    group.add(this.addInkShell(walls, wall_geo, 1.05));

    const roof_geo = new THREE.ConeGeometry(0.145, 0.1, 4);
    const roof = new THREE.Mesh(roof_geo, mats.roof);
    roof.position.y = 0.16;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    group.add(this.addInkShell(roof, roof_geo, 1.05));

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), mats.trim);
    chimney.position.set(0.045, 0.175, -0.02);
    group.add(chimney);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.012), mats.trim);
    door.position.set(0, 0.038, 0.078);
    group.add(door);

    const window = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.01), mats.light);
    window.position.set(-0.05, 0.075, 0.076);
    group.add(window);

    this.scene.add(group);
  }

  addCity(q, r, vertex, color) {
    const THREE = this.THREE;
    const v = this.hexVertex(q, r, vertex);
    const mats = this.pieceMaterials(color);
    const group = new THREE.Group();
    group.position.set(v.x, this.tile_thickness, v.z);
    group.rotation.y = vertex * (Math.PI / 3);
    group.scale.setScalar(0.86);

    const hall_geo = new THREE.BoxGeometry(0.24, 0.15, 0.2);
    const hall = new THREE.Mesh(hall_geo, mats.wall);
    hall.position.y = 0.075;
    hall.castShadow = true;
    group.add(hall);
    group.add(this.addInkShell(hall, hall_geo, 1.05));

    const wing_geo = new THREE.BoxGeometry(0.12, 0.12, 0.14);
    const wing = new THREE.Mesh(wing_geo, mats.wall);
    wing.position.set(0.14, 0.06, 0.02);
    wing.castShadow = true;
    group.add(wing);

    const roof_geo = new THREE.ConeGeometry(0.185, 0.12, 4);
    const roof = new THREE.Mesh(roof_geo, mats.roof);
    roof.position.y = 0.2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    group.add(this.addInkShell(roof, roof_geo, 1.05));

    const wing_roof = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 4), mats.roof);
    wing_roof.position.set(0.14, 0.16, 0.02);
    wing_roof.rotation.y = Math.PI / 4;
    group.add(wing_roof);

    const tower_geo = new THREE.CylinderGeometry(0.045, 0.05, 0.28, 8);
    const tower = new THREE.Mesh(tower_geo, mats.wall);
    tower.position.set(-0.08, 0.14, -0.04);
    tower.castShadow = true;
    group.add(tower);
    group.add(this.addInkShell(tower, tower_geo, 1.05));

    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 8), mats.roof);
    spire.position.set(-0.08, 0.32, -0.04);
    group.add(spire);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.012), mats.trim);
    door.position.set(0.02, 0.045, 0.104);
    group.add(door);

    const window = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.01), mats.light);
    window.position.set(-0.07, 0.1, 0.102);
    group.add(window);

    this.scene.add(group);
  }

  attachEvents() {
    const el = this.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.last_x = e.clientX;
      this.last_y = e.clientY;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) {
        return;
      }
      const dx = e.clientX - this.last_x;
      const dy = e.clientY - this.last_y;
      this.last_x = e.clientX;
      this.last_y = e.clientY;
      this.orbit_theta -= dx * 0.007;
      this.orbit_phi = Math.min(this.max_phi, Math.max(this.min_phi, this.orbit_phi - dy * 0.007));
      this.updateCamera();
    });

    const stopDrag = (e) => {
      this.dragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (err) {}
    };
    el.addEventListener('pointerup', stopDrag);
    el.addEventListener('pointercancel', stopDrag);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.orbit_radius = Math.min(
          this.max_radius,
          Math.max(this.min_radius, this.orbit_radius + e.deltaY * 0.02)
        );
        this.updateCamera();
      },
      { passive: false }
    );

    this.on_resize = () => this.resize();
    window.addEventListener('resize', this.on_resize);
  }

  updateCamera() {
    if (!this.camera) {
      return;
    }
    const x = this.orbit_radius * Math.sin(this.orbit_phi) * Math.sin(this.orbit_theta);
    const y = this.orbit_radius * Math.cos(this.orbit_phi);
    const z = this.orbit_radius * Math.sin(this.orbit_phi) * Math.cos(this.orbit_theta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, this.tile_thickness, 0);
    this.orientFaceTokens();
  }

  orientFaceTokens() {
    if (!this.camera || !this.face_tokens) {
      return;
    }
    this.face_tokens.forEach((obj) => {
      obj.getWorldPosition(this._face_pos || (this._face_pos = new this.THREE.Vector3()));
      const px = this._face_pos.x;
      const pz = this._face_pos.z;
      obj.rotation.y = Math.atan2(
        this.camera.position.x - px,
        this.camera.position.z - pz
      );
    });
  }

  resize() {
    if (!this.renderer || !this.container) {
      return;
    }
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    if (!this.animating) {
      return;
    }
    requestAnimationFrame(() => this.animate());
    if (this.wave_map) {
      const t = Date.now() * 0.00008;
      this.wave_map.offset.set(Math.sin(t) * 0.015, t * 0.12);
    }
    this.orientFaceTokens();
    this.renderer.render(this.scene, this.camera);
  }
}

module.exports = Board;
