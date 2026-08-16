let wood_map = null;
const piece_mat_cache = {};

function createWoodTexture(THREE, seeded) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = seeded(771);
  ctx.fillStyle = '#e8d5b8';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = rand() > 0.5 ? '#c4a882' : '#d8c4a0';
    ctx.globalAlpha = 0.35 + rand() * 0.3;
    ctx.lineWidth = 1 + rand() * 2;
    const y = i * 7 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(40, y + 2, 80, y - 2, size, y + (rand() - 0.5) * 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function getPieceMaterials(THREE, color, seeded) {
  if (!wood_map) {
    wood_map = createWoodTexture(THREE, seeded);
  }
  const key = color;
  if (piece_mat_cache[key]) {
    return piece_mat_cache[key];
  }
  const mats = {
    road: new THREE.MeshLambertMaterial({ color, map: wood_map }),
    wall: new THREE.MeshLambertMaterial({ color }),
    roof: new THREE.MeshLambertMaterial({ color: 0x8f4a3c }),
    trim: new THREE.MeshLambertMaterial({ color: 0x4a3830 }),
    light: new THREE.MeshLambertMaterial({ color: 0xf0e6d0 })
  };
  piece_mat_cache[key] = mats;
  return mats;
}

module.exports = { getPieceMaterials };
