const { addInkShell } = require('./ink-shell');

function createRoad(THREE, length, mats) {
  const group = new THREE.Group();

  const plank_geo = new THREE.BoxGeometry(0.3, 0.036, length);
  const plank = new THREE.Mesh(plank_geo, mats.road);
  plank.position.y = 0.018;
  plank.castShadow = true;
  plank.receiveShadow = true;
  group.add(plank);
  group.add(addInkShell(THREE, plank, plank_geo, 1.05));

  const groove = new THREE.BoxGeometry(0.012, 0.005, length * 0.9);
  for (const x of [-0.072, 0.072]) {
    const line = new THREE.Mesh(groove, mats.trim);
    line.position.set(x, 0.038, 0);
    group.add(line);
  }

  const cap_geo = new THREE.CylinderGeometry(0.15, 0.15, 0.036, 8);
  [-length / 2, length / 2].forEach((z) => {
    const cap = new THREE.Mesh(cap_geo, mats.road);
    cap.position.set(0, 0.018, z);
    group.add(cap);
  });

  return group;
}

module.exports = { createRoad };
