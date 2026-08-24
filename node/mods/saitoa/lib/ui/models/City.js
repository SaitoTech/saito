const { addInkShell } = require('./ink-shell');

function createCity(THREE, mats) {
  const group = new THREE.Group();
  group.scale.setScalar(3.05);

  const hall_geo = new THREE.BoxGeometry(0.24, 0.15, 0.2);
  const hall = new THREE.Mesh(hall_geo, mats.wall);
  hall.position.y = 0.075;
  hall.castShadow = true;
  group.add(hall);
  group.add(addInkShell(THREE, hall, hall_geo, 1.05));

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
  group.add(addInkShell(THREE, roof, roof_geo, 1.05));

  const wing_roof = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 4), mats.roof);
  wing_roof.position.set(0.14, 0.16, 0.02);
  wing_roof.rotation.y = Math.PI / 4;
  group.add(wing_roof);

  const tower_geo = new THREE.CylinderGeometry(0.045, 0.05, 0.28, 8);
  const tower = new THREE.Mesh(tower_geo, mats.wall);
  tower.position.set(-0.08, 0.14, -0.04);
  tower.castShadow = true;
  group.add(tower);
  group.add(addInkShell(THREE, tower, tower_geo, 1.05));

  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 8), mats.roof);
  spire.position.set(-0.08, 0.32, -0.04);
  group.add(spire);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.012), mats.trim);
  door.position.set(0.02, 0.045, 0.104);
  group.add(door);

  const window = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.01), mats.light);
  window.position.set(-0.07, 0.1, 0.102);
  group.add(window);

  return group;
}

module.exports = { createCity };
