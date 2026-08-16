let desert_rock_mat = null;

function desertRockMaterial(THREE) {
  if (!desert_rock_mat) {
    desert_rock_mat = new THREE.MeshLambertMaterial({ color: 0xb89a72 });
  }
  return desert_rock_mat;
}

function createDesertRock(THREE, rand) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.08 + rand() * 0.04, 7, 6);
  const rock = new THREE.Mesh(geo, desertRockMaterial(THREE));
  rock.scale.set(1 + rand() * 0.5, 0.35 + rand() * 0.2, 0.8 + rand() * 0.4);
  rock.position.set(0, 0.01, 0);
  rock.rotation.y = rand() * Math.PI;
  rock.castShadow = true;
  group.add(rock);
  return group;
}

module.exports = { createDesertRock };
