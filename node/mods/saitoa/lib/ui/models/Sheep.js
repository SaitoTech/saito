let body_mat = null;
let head_mat = null;

function sheepMaterials(THREE) {
  if (!body_mat) {
    body_mat = new THREE.MeshLambertMaterial({ color: 0xf3efe4 });
    head_mat = new THREE.MeshLambertMaterial({ color: 0x3d342c });
  }
  return { body_mat, head_mat };
}

function createSheep(THREE, rand) {
  const mats = sheepMaterials(THREE);
  const group = new THREE.Group();
  group.rotation.y = rand() * Math.PI * 2;
  const s = 0.85 + rand() * 0.25;
  group.scale.setScalar(s);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), mats.body_mat);
  body.scale.set(1.35, 0.9, 1.05);
  body.position.y = 0.08;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), mats.head_mat);
  head.position.set(0, 0.09, 0.1);
  head.scale.set(0.9, 0.85, 1.15);
  group.add(head);

  for (let i = 0; i < 2; i++) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), mats.head_mat);
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
    const leg = new THREE.Mesh(leg_geo, mats.head_mat);
    leg.position.set(p[0], p[1], p[2]);
    group.add(leg);
  });

  return group;
}

module.exports = { createSheep };
