module.exports = () => {
  return `
    <div class="game-minimap">
      <div class="game-minimap-resize" aria-hidden="true"></div>
      <button type="button" class="game-minimap-close" aria-label="Hide minimap">&times;</button>
      <div class="board">
        <div class="markers"></div>
        <div class="viewport"></div>
      </div>
    </div>
  `;
};

module.exports.restoreButton = () => {
  return `
    <button type="button" id="game-minimap-restore" class="game-minimap-restore" aria-label="Show minimap">
      <i class="fa fa-arrows-alt" aria-hidden="true"></i>
    </button>
  `;
};
