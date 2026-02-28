/**
 * Template for the Game Observer HUD (controls, slider, status line only).
 * No loader/sync markup. Renders inside a provided container only.
 */
module.exports = () => {
  return `
    <div id="game-observer-hud" class="game-observer-hud">

      <!-- Line 1: Status -->
      <div id="observer-status-line" class="game-observer-title">
        Loading Moves...
      </div>

      <!-- Line 2: Controls -->
      <div class="game-observer-controls-row">

        <button type="button"
                id="observer-back"
                class="game-observer-btn"
                title="Step back">
          <i class="fas fa-step-backward"></i>
        </button>

        <button type="button"
                id="observer-play"
                class="game-observer-btn play-state"
                title="Play / Pause">
          <i class="fas fa-play"></i>
          <i class="fas fa-pause"></i>
        </button>

        <button type="button"
                id="observer-forward"
                class="game-observer-btn"
                title="Step forward">
          <i class="fas fa-step-forward"></i>
        </button>

      </div>

      <!-- Line 3: Slider -->
      <div class="game-observer-slider-row">
        <input type="range"
               id="game-observer-state-slider"
               class="game-observer-state-slider"
               min="0"
               max="0"
               value="0">
      </div>

      <!-- Line 4: Status line (secondary) -->
      <div id="obstatus" class="status">
        Observer mode
      </div>

    </div>
  `;
};
