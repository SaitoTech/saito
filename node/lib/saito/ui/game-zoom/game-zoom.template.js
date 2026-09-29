module.exports = () => {
  return `
    <div class="game-zoom">
      <button type="button" class="plus" aria-label="Zoom in">+</button>
      <div class="track">
        <div class="fill"></div>
      </div>
      <button type="button" class="minus" aria-label="Zoom out">−</button>
      <button type="button" class="center" aria-label="Center board">
        <i class="fa fa-arrows-alt" aria-hidden="true"></i>
      </button>
    </div>
  `;
};
