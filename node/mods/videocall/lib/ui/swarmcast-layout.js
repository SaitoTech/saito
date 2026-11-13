const ASPECT = 16 / 9;
const GAP = 16;
const MAX_TILE = 1120;

function fitGrid(count, width, height, options = {}) {
  const gap = options.gap ?? GAP;
  const aspect = options.aspect ?? ASPECT;
  const maxTile = options.maxTile ?? Infinity;
  if (!count || width <= 0 || height <= 0) {
    return { columns: 1, rows: 1, tileWidth: 0, tileHeight: 0 };
  }
  let best = null;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const usableWidth = width - gap * (columns - 1);
    const usableHeight = height - gap * (rows - 1);
    if (usableWidth <= 0 || usableHeight <= 0) continue;
    let tileWidth = Math.min(usableWidth / columns, (usableHeight / rows) * aspect);
    if (tileWidth > maxTile) tileWidth = maxTile;
    const tileHeight = tileWidth / aspect;
    const empty = columns * rows - count;
    if (
      !best ||
      tileWidth > best.tileWidth + 0.5 ||
      (Math.abs(tileWidth - best.tileWidth) <= 0.5 && empty < best.empty)
    ) {
      best = { columns, rows, tileWidth, tileHeight, empty };
    }
  }
  return best || { columns: 1, rows: count, tileWidth: 0, tileHeight: 0 };
}

function arrangeTiles(count, width, height, mode = 'auto') {
  const capped = mode === 'grid' || mode === 'focus' ? Infinity : MAX_TILE;
  return { mode, ...fitGrid(count, width, height, { maxTile: capped }) };
}

module.exports = { ASPECT, GAP, MAX_TILE, fitGrid, arrangeTiles };
