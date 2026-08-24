let hill_mats = null;

function hillockMaterials(THREE) {
  if (!hill_mats) {
    hill_mats = [
      new THREE.MeshLambertMaterial({ color: 0xc46a45 }),
      new THREE.MeshLambertMaterial({ color: 0xa85838 })
    ];
  }
  return hill_mats;
}

function createHillock(THREE, index, rand) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.22, 10, 8);
  const mesh = new THREE.Mesh(geo, hillockMaterials(THREE)[index % 2]);
  const sx = 0.85 + rand() * 0.45;
  const sy = 0.28 + rand() * 0.12;
  const sz = 0.7 + rand() * 0.35;
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(0, 0.22 * sy * 0.55, 0);
  mesh.rotation.y = rand() * Math.PI;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

module.exports = { createHillock };
