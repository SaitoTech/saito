// Original, grid-drawn SVG art. No fonts, spritesheets, or remote resources.
const glyphs = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100']
};
function pixelText(text, x, y, scale = 1, color = 'currentColor') {
  let pixels = '';
  [...text.toUpperCase()].forEach((letter, i) => {
    (glyphs[letter] || []).forEach((row, dy) =>
      [...row].forEach((v, dx) => {
        if (v === '1') pixels += `<rect x="${i * 6 + dx}" y="${dy}" width="1" height="1"/>`;
      })
    );
  });
  return `<g fill="${color}" transform="translate(${x} ${y}) scale(${scale})">${pixels}</g>`;
}
const palette = {
  h: '#733e36',
  s: '#ffd0a2',
  w: '#f5ece0',
  b: '#4ad9bf',
  d: '#283750',
  g: '#778fa4',
  m: '#c1d5db',
  r: '#ff3d4d',
  o: '#ff862e',
  y: '#ffe66d'
};
const sprites = {
  sarah: [
    '....hhhh....',
    '...hhhhhh...',
    '...hssssh...',
    '...hsssss...',
    '....ssss....',
    '...bwwbb....',
    '..sbbbbbs...',
    '..sbbbbb.s..',
    '..s.dddd.s..',
    '....dddd....',
    '....d..d....',
    '...dd..dd...'
  ],
  robot: [
    '....mmmm....',
    '...mggggm...',
    '...grggrg...',
    '...gmmmmg...',
    '....mggm....',
    '..gmmggmmg..',
    '..mgmmmmgm..',
    '..m.gmmg.m..',
    '..g.gmmg.g..',
    '....g..g....',
    '...mg..gm...',
    '...mm..mm...'
  ],
  fire: [
    '.....r......',
    '....ro......',
    '..r.roy.....',
    '..orror.r...',
    '..royoror...',
    '.rroyyyor...',
    '.royyyyorr..',
    '..oyyyyor...',
    '...oyyo.....',
    '..ggmmgg....',
    '.ggggggggg..',
    '............'
  ]
};
function sprite(type, x = 0, y = 0, scale = 1) {
  let pixels = '';
  sprites[type].forEach((row, dy) =>
    [...row].forEach((v, dx) => {
      if (palette[v])
        pixels += `<rect x="${dx}" y="${dy}" width="1" height="1" fill="${palette[v]}"/>`;
    })
  );
  return `<g transform="translate(${x} ${y}) scale(${scale})">${pixels}</g>`;
}
function svg(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${content}</svg>`;
}
function skyline() {
  let art =
    '<rect width="960" height="540" fill="#080e1b"/><rect y="340" width="960" height="200" fill="#101b2b"/>';
  for (let i = 0; i < 90; i++)
    art += `<rect x="${(i * 137) % 960}" y="${(i * 61) % 290}" width="2" height="2" fill="${i % 3 ? '#3a5368' : '#a3cecf'}"/>`;
  for (let i = 0; i < 17; i++) {
    const h = 40 + ((i * 47) % 130);
    art += `<rect x="${i * 60}" y="${340 - h}" width="48" height="${h}" fill="#1b2a3a"/>`;
    for (let j = 0; j < 5; j++)
      art += `<rect x="${i * 60 + 8}" y="${348 - h + j * 23}" width="5" height="3" fill="#456273"/>`;
  }
  for (let y = 360; y < 540; y += 30) art += `<path d="M0 ${y}H960" stroke="#223348"/>`;
  for (let x = -480; x < 1440; x += 80) art += `<path d="M480 340L${x} 540" stroke="#223348"/>`;
  return art;
}
function background() {
  return svg(960, 540, skyline());
}
function banner() {
  return svg(
    960,
    540,
    skyline() +
      pixelText('LOS ANGELES / 2029', 42, 38, 2, '#58d8c1') +
      pixelText('TERMINATORS', 42, 90, 8, '#ff4555') +
      pixelText('RUN SARAH RUN', 46, 166, 4, '#f2eddf') +
      pixelText('NO FATE BUT WHAT WE MAKE', 46, 212, 2, '#91a9b9') +
      sprite('sarah', 424, 304, 12) +
      sprite('robot', 190, 324, 9) +
      sprite('robot', 686, 312, 10) +
      sprite('fire', 70, 409, 7) +
      sprite('fire', 807, 409, 7) +
      pixelText('SAITO ARCADE', 408, 500, 2, '#58d8c1')
  );
}
function thumbnail() {
  return svg(
    600,
    600,
    `<g transform="scale(.625 1.1112)">${skyline()}</g>` +
      pixelText('TERMINATORS', 38, 44, 8, '#ff4555') +
      pixelText('RUN SARAH RUN', 68, 120, 6, '#f2eddf') +
      sprite('robot', 40, 216, 12) +
      sprite('robot', 406, 216, 12) +
      sprite('sarah', 192, 237, 18) +
      sprite('fire', 22, 416, 8) +
      sprite('fire', 484, 416, 8) +
      pixelText('SAITO ARCADE', 158, 556, 4, '#58d8c1')
  );
}
function icon() {
  return svg(
    192,
    192,
    '<rect width="192" height="192" fill="#080e1b"/>' +
      sprite('robot', 24, 18, 12) +
      pixelText('TERMINATOR', 37, 168, 2, '#ff4555')
  );
}
function dataURI(source) {
  // Shared Arcade/splash templates use both quoted and unquoted CSS url().
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(source).replace(
      /[!'()*]/g,
      (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase()
    )
  );
}
module.exports = { glyphs, pixelText, sprite, svg, banner, background, thumbnail, icon, dataURI };
