let ink_mat = null;

function inkMaterial(THREE) {
  if (!ink_mat) {
    ink_mat = new THREE.MeshBasicMaterial({
      color: 0x3d3830,
      side: THREE.BackSide
    });
  }
  return ink_mat;
}

function addInkShell(THREE, mesh, geo, factor) {
  const shell = new THREE.Mesh(geo, inkMaterial(THREE));
  shell.position.copy(mesh.position);
  shell.rotation.copy(mesh.rotation);
  shell.scale.copy(mesh.scale);
  shell.scale.multiplyScalar(factor || 1.07);
  return shell;
}

module.exports = { addInkShell };
