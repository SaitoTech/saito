// Run from node/: node mods/robots/docs/build/art.js
const fs = require('fs');
const path = require('path');
const art = require('../../lib/art');
for (const [file, render] of [
  ['arcade.svg', art.thumbnail],
  ['background.svg', art.background],
  ['icon.svg', art.icon]
]) {
  fs.writeFileSync(path.join(__dirname, '..', 'art', file), render());
}
