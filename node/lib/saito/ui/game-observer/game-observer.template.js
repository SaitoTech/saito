module.exports = (game_mod, is_loading = true) => {

  if (is_loading) {
    return `
      <div id="observer-sync-overlay" class="game-observer-sync-overlay">
        <div class="game-observer-sync-title">Syncing Game</div>
        <div class="game-observer-inline-spinner"></div>
        <div id="observer-sync-status" class="game-observer-sync-status">
          Communicating with server...
        </div>
      </div>
    `;
  }

  return `
    <div id="game-observer-hud" class="game-observer-hud">

      <!-- Line 1: Step -->
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

      <!-- Line 4: Status -->
      <div id="obstatus" class="status">
        Observer mode
      </div>

    </div>
  `;
};
