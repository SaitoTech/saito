const { addInkShell } = require('./ink-shell');

let rock_mat = null;
let rock_dark_mat = null;
let snow_mat = null;

function mountainMaterials(THREE) {
  if (!rock_mat) {
    rock_mat = new THREE.MeshLambertMaterial({ color: 0x8b9098 });
    rock_dark_mat = new THREE.MeshLambertMaterial({ color: 0x6f747c });
    snow_mat = new THREE.MeshLambertMaterial({ color: 0xf2f0ea });
  }
  return { rock_mat, rock_dark_mat, snow_mat };
}

function mountainGeometry(THREE, width, height, rand) {
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

function createMountain(THREE, width, height, rand) {
  const mats = mountainMaterials(THREE);
  const group = new THREE.Group();
  const { geo, peak } = mountainGeometry(THREE, width, height, rand);
  const mesh = new THREE.Mesh(geo, rand() > 0.5 ? mats.rock_mat : mats.rock_dark_mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.add(addInkShell(THREE, mesh, geo, 1.04));

  const snow = new THREE.Mesh(
    new THREE.ConeGeometry(width * 0.22, height * 0.22, 5),
    mats.snow_mat
  );
  snow.position.set(peak[0] * 0.15, height * 0.86, peak[2] * 0.15);
  group.add(snow);
  return group;
}

module.exports = { createMountain };
