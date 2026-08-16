const { createTree } = require('../models/Tree');
const { createSheep } = require('../models/Sheep');
const { createWheat } = require('../models/Wheat');
const { createHillock } = require('../models/Hillock');
const { createMountain } = require('../models/Mountain');
const { createDesertRock } = require('../models/DesertRock');
const { createRoad } = require('../models/Road');
const { createSettlement } = require('../models/Settlement');
const { createCity } = require('../models/City');
const { createPort, PORT_DOCK_LENGTH } = require('../models/Port');
const { getPieceMaterials } = require('../models/piece-materials');

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

  addPorts() {
    this.returnPorts().forEach((port) => this.addPort(port));
  }

  addPort(port) {
    const out = this.edgeOutward(port.q, port.r, port.e);
    const dock_len = PORT_DOCK_LENGTH;
    const origin_x = out.mx + out.nx * 0.18;
    const origin_z = out.mz + out.nz * 0.18;
    const mats = this.pieceMaterials(0xb08958);
    const { dock, sign } = createPort(this.THREE, port.ratio, mats);
    dock.position.set(origin_x, 0.1, origin_z);
    dock.rotation.y = Math.atan2(out.nx, out.nz);
    sign.position.set(
      origin_x + out.nx * dock_len * 0.38,
      0.12,
      origin_z + out.nz * dock_len * 0.38
    );
    this.scene.add(sign);
    this.face_tokens.push(sign);
    this.scene.add(dock);
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
    if (tile.q === 1 && tile.r === 0 && tile.terrain === 'forest') {
      this.addArtworkOverlay(hex, '/saitoa/img/board/forest.png', 'interior');
    }
    if (tile.terrain === 'fields') {
      this.addArtworkOverlay(hex, '/saitoa/img/board/fields.png', 'hex');
    }
    if (tile.terrain === 'mountains') {
      this.addArtworkOverlay(hex, '/saitoa/img/board/ore.png', 'hex');
    }
    if (tile.terrain === 'hills') {
      this.addArtworkOverlay(hex, '/saitoa/img/board/brick.png', 'hex');
    }
  }

  addArtworkOverlay(hex, src, fit) {
    if (!this.artwork_cache) {
      this.artwork_cache = {};
    }
    const entry = this.artwork_cache[src];
    if (entry && entry.texture) {
      this.attachArtworkMesh(hex, entry);
      return;
    }
    if (entry && entry.queue) {
      entry.queue.push(hex);
      return;
    }

    const board = this;
    const THREE = this.THREE;
    this.artwork_cache[src] = { queue: [hex], fit: fit };
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      let min_x = canvas.width;
      let min_y = canvas.height;
      let max_x = 0;
      let max_y = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] < 18 && px[i + 1] < 18 && px[i + 2] < 18) {
          px[i + 3] = 0;
        } else {
          const p = i / 4;
          const x = p % canvas.width;
          const y = (p - x) / canvas.width;
          if (x < min_x) {
            min_x = x;
          }
          if (y < min_y) {
            min_y = y;
          }
          if (x > max_x) {
            max_x = x;
          }
          if (y > max_y) {
            max_y = y;
          }
        }
      }
      ctx.putImageData(data, 0, 0);

      const map = new THREE.CanvasTexture(canvas);
      map.encoding = THREE.sRGBEncoding;
      map.anisotropy = 4;
      map.needsUpdate = true;

      const cached = board.artwork_cache[src];
      cached.texture = map;
      cached.canvas_w = canvas.width;
      cached.canvas_h = canvas.height;
      cached.bbox_h = Math.max(1, max_y - min_y + 1);
      cached.material = new THREE.MeshLambertMaterial({
        map: map,
        transparent: true,
        alphaTest: 0.08,
        depthWrite: true
      });
      const waiting = cached.queue;
      cached.queue = null;
      for (let i = 0; i < waiting.length; i++) {
        board.attachArtworkMesh(waiting[i], cached);
      }
    };
    img.src = src;
  }

  attachArtworkMesh(hex, entry) {
    const THREE = this.THREE;
    const aspect = entry.canvas_w / entry.canvas_h;
    let art_z;
    if (entry.fit === 'hex') {
      art_z = this.hex_size * 2 * (entry.canvas_h / entry.bbox_h);
    } else {
      art_z = this.hex_size * Math.sqrt(3) * 0.83;
    }
    const art_x = art_z * aspect;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(art_x, art_z), entry.material);
    art.rotation.x = -Math.PI / 2;
    art.position.set(0, this.tile_thickness + 0.005, 0);
    hex.add(art);
  }

  pieceMaterials(color) {
    const board = this;
    return getPieceMaterials(this.THREE, color, function (seed) {
      return board.seeded(seed);
    });
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
      const tree = createTree(this.THREE, kind, scale, rand);
      tree.position.set(pos.x + spot.x, this.tile_thickness, pos.z + spot.z);
      this.scene.add(tree);
    }
  }

  addPastureFlock(pos, rand, occupied) {
    const count = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const spot = this.hexPropSpot(rand, occupied, 0.38);
      const sheep = createSheep(this.THREE, rand);
      sheep.position.set(pos.x + spot.x, this.tile_thickness, pos.z + spot.z);
      this.scene.add(sheep);
    }
  }

  addWheatPatches(pos, rand, occupied) {
    const patches = 3;
    for (let p = 0; p < patches; p++) {
      const spot = this.hexPropSpot(rand, occupied, 0.42);
      const wheat = createWheat(this.THREE, rand);
      wheat.position.set(pos.x + spot.x, this.tile_thickness, pos.z + spot.z);
      this.scene.add(wheat);
    }
  }

  addHillocks(pos, rand, occupied) {
    const count = 2;
    for (let i = 0; i < count; i++) {
      const spot = this.hexPropSpot(rand, occupied, 0.42);
      const hillock = createHillock(this.THREE, i, rand);
      hillock.position.set(pos.x + spot.x, this.tile_thickness, pos.z + spot.z);
      this.scene.add(hillock);
    }
  }

  addMountainGroup(pos, rand, occupied) {
    const count = 2;
    for (let i = 0; i < count; i++) {
      const spot = this.hexPropSpot(rand, occupied, 0.42);
      const h = 0.38 + rand() * 0.16 + (i === 0 ? 0.06 : 0);
      const w = 0.26 + rand() * 0.1;
      const mountain = createMountain(this.THREE, w, h, rand);
      mountain.position.set(pos.x + spot.x, this.tile_thickness, pos.z + spot.z);
      this.scene.add(mountain);
    }
  }

  addDesertRocks(pos, rand, occupied) {
    const count = 2;
    for (let i = 0; i < count; i++) {
      const spot = this.hexPropSpot(rand, occupied, 0.45);
      const rock = createDesertRock(this.THREE, rand);
      rock.position.set(pos.x + spot.x, this.tile_thickness, pos.z + spot.z);
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
    const seg = this.hexEdge(q, r, edge);
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const length = Math.hypot(dx, dz) * 0.64;
    const road = createRoad(this.THREE, length, this.pieceMaterials(color));
    road.position.set((seg.a.x + seg.b.x) / 2, this.tile_thickness, (seg.a.z + seg.b.z) / 2);
    road.rotation.y = Math.atan2(dx, dz);
    this.scene.add(road);
  }

  addSettlement(q, r, vertex, color) {
    const v = this.hexVertex(q, r, vertex);
    const settlement = createSettlement(this.THREE, this.pieceMaterials(color));
    settlement.position.set(v.x, this.tile_thickness, v.z);
    settlement.rotation.y = vertex * (Math.PI / 3);
    this.scene.add(settlement);
  }

  addCity(q, r, vertex, color) {
    const v = this.hexVertex(q, r, vertex);
    const city = createCity(this.THREE, this.pieceMaterials(color));
    city.position.set(v.x, this.tile_thickness, v.z);
    city.rotation.y = vertex * (Math.PI / 3);
    this.scene.add(city);
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
    const frame = 2.4;
    this.camera.lookAt(
      Math.sin(this.orbit_theta) * frame,
      this.tile_thickness,
      Math.cos(this.orbit_theta) * frame
    );
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
