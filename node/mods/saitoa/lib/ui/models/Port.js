const { addInkShell } = require('./ink-shell');

const PORT_DOCK_LENGTH = 0.72;

function createPortSignTexture(THREE, ratio) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efe4cc';
  ctx.fillRect(8, 18, 112, 92);
  ctx.strokeStyle = '#3a342c';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 18, 112, 92);
  ctx.fillStyle = '#2a2622';
  ctx.font = 'bold 48px Georgia, Times New Roman, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ratio, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;
  return texture;
}

function createPort(THREE, ratio, mats) {
  const dock_len = PORT_DOCK_LENGTH;
  const dock = new THREE.Group();

  const dock_geo = new THREE.BoxGeometry(0.18, 0.04, dock_len);
  const plank = new THREE.Mesh(dock_geo, mats.road);
  plank.position.set(0, 0, dock_len / 2);
  plank.castShadow = true;
  plank.receiveShadow = true;
  dock.add(plank);

  for (const z of [0.12, dock_len - 0.08]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.026, 0.18, 6),
      mats.trim
    );
    post.position.set(0.06, -0.06, z);
    dock.add(post);
  }

  const hut_geo = new THREE.BoxGeometry(0.13, 0.09, 0.11);
  const hut = new THREE.Mesh(hut_geo, mats.wall);
  hut.position.set(0, 0.065, dock_len - 0.18);
  hut.castShadow = true;
  dock.add(hut);
  dock.add(addInkShell(THREE, hut, hut_geo, 1.06));

  const hut_roof = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 4), mats.roof);
  hut_roof.position.set(0, 0.135, dock_len - 0.18);
  hut_roof.rotation.y = Math.PI / 4;
  dock.add(hut_roof);

  const boat = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6a4330 })
  );
  boat.scale.set(1.5, 0.42, 0.75);
  boat.position.set(-0.15, -0.06, dock_len * 0.55);
  dock.add(boat);

  const sign = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.016, 0.22, 6),
    mats.trim
  );
  pole.position.y = 0.11;
  sign.add(pole);

  const board_geo = new THREE.PlaneGeometry(0.22, 0.16);
  const board = new THREE.Mesh(
    board_geo,
    new THREE.MeshLambertMaterial({ map: createPortSignTexture(THREE, ratio) })
  );
  board.position.y = 0.24;
  sign.add(board);
  const back = new THREE.Mesh(
    board_geo,
    new THREE.MeshLambertMaterial({ color: 0x5a4434 })
  );
  back.position.y = 0.24;
  back.rotation.y = Math.PI;
  sign.add(back);

  return { dock, sign };
}

module.exports = { createPort, PORT_DOCK_LENGTH };
