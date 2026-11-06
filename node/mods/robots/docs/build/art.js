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

// Optional authoring step; ordinary module builds use the checked-in PNG.
// Requires Playwright with Chromium, as does the Robots browser smoke test.
if (process.argv.includes('--png')) {
  renderThumbnail().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function renderThumbnail() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const png = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    }, art.dataURI(art.thumbnail()));
    fs.writeFileSync(path.join(__dirname, '..', 'art', 'arcade.png'), Buffer.from(png, 'base64'));
  } finally {
    await browser.close();
  }
}
