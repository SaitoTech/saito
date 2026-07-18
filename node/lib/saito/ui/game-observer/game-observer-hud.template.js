/**
 * Template for the Game Observer HUD (controls, slider, status line only).
 * No loader/sync markup. Renders inside a provided container only.
 */
module.exports = () => {
  return `
    <div id="game-observer-hud" class="game-observer-hud">

      <!-- Row 1: Status (single line only) -->
      <div id="observer-status-line" class="game-observer-title">
        Press Play to Observe
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

      <!-- Line 3: Timeline (1 — slider — total) -->
      <div class="game-observer-timeline-row">
        <div class="game-observer-timeline-tooltip" id="observer-timeline-tooltip" aria-hidden="true"></div>
        <div class="game-observer-timeline-inner">
          <span class="timeline-start">1</span>
          <input type="range"
                 id="game-observer-state-slider"
                 class="saito-range game-observer-state-slider"
                 min="0"
                 max="0"
                 value="0">
          <span class="timeline-end">0</span>
        </div>
      </div>

    </div>
  `;
};
