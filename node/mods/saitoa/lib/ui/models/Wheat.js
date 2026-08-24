let wheat_mats = null;
let wheat_geo = null;

function wheatAssets(THREE) {
  if (!wheat_geo) {
    wheat_mats = [
      new THREE.MeshLambertMaterial({ color: 0xd4b44a }),
      new THREE.MeshLambertMaterial({ color: 0xc49a38 }),
      new THREE.MeshLambertMaterial({ color: 0xe0c56a })
    ];
    wheat_geo = new THREE.BoxGeometry(0.018, 0.16, 0.012);
  }
  return { wheat_mats, wheat_geo };
}

function createWheat(THREE, rand) {
  const shared = wheatAssets(THREE);
  const group = new THREE.Group();
  group.rotation.y = rand() * Math.PI * 2;
  const stalks = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < stalks; i++) {
    const stalk = new THREE.Mesh(shared.wheat_geo, shared.wheat_mats[i % 3]);
    const ox = (rand() - 0.5) * 0.15;
    const oz = (rand() - 0.5) * 0.11;
    const h = 0.65 + rand() * 0.3;
    stalk.position.set(ox, 0.08 * h, oz);
    stalk.scale.set(1, h, 1);
    stalk.rotation.z = (rand() - 0.5) * 0.22;
    stalk.rotation.x = (rand() - 0.5) * 0.12;
    group.add(stalk);
  }
  return group;
}

module.exports = { createWheat };
