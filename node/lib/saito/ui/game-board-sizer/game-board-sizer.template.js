module.exports = (maxZoom) => {
  var html = `
    <div id="game_board_sizer" class="game_board_sizer">
      <button type="button" class="game-board-sizer-center" aria-label="Center board">
        <i class="fa fa-arrows-alt" aria-hidden="true"></i>
      </button>
      <div class="game-board-sizer-control">
        <button type="button" class="game-board-sizer-step" data-board-zoom="-1" aria-label="Shrink board">-</button>
        <input type="range" class="saito-range" min="2" max="${maxZoom}" value="100" aria-label="Board zoom" />
        <button type="button" class="game-board-sizer-step" data-board-zoom="1" aria-label="Magnify board">+</button>
      </div>
    </div>
    `;

  return html;
};
