const { addInkShell } = require('./ink-shell');

function createSettlement(THREE, mats) {
  const group = new THREE.Group();
  group.scale.setScalar(2.2);
  const wall_geo = new THREE.BoxGeometry(0.18, 0.12, 0.15);
  const walls = new THREE.Mesh(wall_geo, mats.wall);
  walls.position.y = 0.06;
  walls.castShadow = true;
  group.add(walls);
  group.add(addInkShell(THREE, walls, wall_geo, 1.05));

  const roof_geo = new THREE.ConeGeometry(0.145, 0.1, 4);
  const roof = new THREE.Mesh(roof_geo, mats.roof);
  roof.position.y = 0.16;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  group.add(addInkShell(THREE, roof, roof_geo, 1.05));

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), mats.trim);
  chimney.position.set(0.045, 0.175, -0.02);
  group.add(chimney);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.012), mats.trim);
  door.position.set(0, 0.038, 0.078);
  group.add(door);

  const window = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.01), mats.light);
  window.position.set(-0.05, 0.075, 0.076);
  group.add(window);

  return group;
}

module.exports = { createSettlement };
