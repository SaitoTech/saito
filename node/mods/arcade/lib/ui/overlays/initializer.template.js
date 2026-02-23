/**
 * Game initializer overlay. Uses canonical .arcade-lounge structure.
 * Variant: .arcade-lounge--ready when game is ready.
 */
module.exports = (ready = false) => {
	if (ready) {
		return `
  <div class="arcade-lounge arcade-lounge--ready">
  <div class="arcade-lounge-header">
	  <div class="arcade-lounge-header-title">Your game is ready!</div>
  </div>
  <div class="arcade-lounge-body"></div>
  <div class="arcade-lounge-controls">
	  <div id="arcade-game-controls-start-game" class="fat saito-button-primary">start game</div>
  </div>
</div>`;
	}
	return `
  <div class="arcade-lounge">
  <div class="arcade-lounge-header">
	  <div class="arcade-lounge-header-title">Your Game is Initializing</div>
  </div>
  <div class="arcade-lounge-body">
	  <div class="arcade-lounge-section">
		  <div id="game-loader-spinner" class="arcade-lounge-loader game-loader-spinner"></div>
	  </div>
  </div>
  <div class="arcade-lounge-controls"></div>
</div>`;
};
