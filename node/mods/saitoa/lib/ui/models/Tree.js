const { addInkShell } = require('./ink-shell');

let assets = null;

function treeAssets(THREE) {
  if (assets) {
    return assets;
  }
  const lathe = (pts, segs) =>
    new THREE.LatheGeometry(
      pts.map((p) => new THREE.Vector2(p[0], p[1])),
      segs
    );

  assets = {
    tree_geos: [
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
    ],
    tree_mats: [
      new THREE.MeshLambertMaterial({ color: 0x355e3c }),
      new THREE.MeshLambertMaterial({ color: 0x3d7044 }),
      new THREE.MeshLambertMaterial({ color: 0x2a4e32 })
    ],
    trunk_geo: new THREE.CylinderGeometry(0.025, 0.032, 0.11, 6),
    trunk_mat: new THREE.MeshLambertMaterial({ color: 0x5a4330 })
  };
  return assets;
}

function createTree(THREE, kind, scale, rand) {
  const shared = treeAssets(THREE);
  const group = new THREE.Group();
  group.rotation.y = rand() * Math.PI * 2;

  const trunk = new THREE.Mesh(shared.trunk_geo, shared.trunk_mat);
  trunk.scale.setScalar(scale);
  trunk.position.y = 0.055 * scale;
  trunk.castShadow = true;
  group.add(trunk);

  const geo = shared.tree_geos[kind];
  const canopy = new THREE.Mesh(geo, shared.tree_mats[kind]);
  canopy.scale.setScalar(scale);
  canopy.position.y = 0.1 * scale;
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  group.add(canopy);
  group.add(addInkShell(THREE, canopy, geo, 1.05));
  return group;
}

module.exports = { createTree };
