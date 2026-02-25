module.exports = (game_mod) => {
  let step = game_mod.game?.step?.game || 0;

  let html = `
    <div id="game-observer-hud" class="game-observer-hud">
      <div class="game-observer-hud-header">
        <div class="game-observer-header-table-button">`;

  if (
    game_mod.game?.live &&
    (!game_mod.game?.options?.eliminated || !game_mod.game.options.eliminated[game_mod.publicKey])
  ) {
    if (game_mod?.archive_exhausted) {
      if (game_mod.opengame) {
        html += `<div id="observer-join-game-btn" class="join-game">JOIN</div>`;
      } else {
        html += '<div></div>';
      }
    } else {
      html += `<div class="observer-loader-spinner"></div>`;
    }
  }

  html += `</div>
        <div id="game-observer-status" class="game-observer-status">Game Step: ${step}</div>
        <div class="game-observer-header-control">${
          game_mod.game?.live
            ? `<div id="game-observer-play-btn" class="game-observer-btn pause-state" title="Stop execution and queue all incoming game moves"><i class="fas fa-pause"></i></div>`
            : ''
        }</div>
      </div>`;

  if (!game_mod.game?.live) {
    html += `<div id="game-observer-controls" class="game-observer-controls">
        <div id="game-observer-first-btn" class="game-observer-btn${
          step == 0 ? ' unavailable' : ''
        }"><i class="fas fa-fast-backward" title="Reset game to beginning state"></i></div>
        <div id="game-observer-last-btn" class="game-observer-btn${
          step == 0 ? ' unavailable' : ''
        }"><i class="fas fa-step-backward" title="Rewind one game move"></i></div>
        <div id="game-observer-play-btn" class="game-observer-btn play-state"><i class="fas fa-play" title="Play moves continually"></i><i class="fas fa-pause" title="Stop execution and queue all incoming game moves"></i></div>
        <div id="game-observer-next-btn" class="game-observer-btn play-state"><i class="fas fa-forward" title="Fast forward"></i><i class="fas fa-step-forward" title="Move forward one game step"></i></div>
      </div>
      <div class="game-observer-state-slider-wrap">
        <input type="range" id="game-observer-state-slider" class="game-observer-state-slider" min="0" max="0" value="0">
        <span id="game-observer-viewing-label" class="game-observer-viewing-label">Viewing move 0 of 0</span>
      </div>`;
  }

  html += `<div id="obstatus" class="status">in observer mode</div>
           <div id="controls"></div>
      <div id="game-observer-sync-overlay" class="game-observer-sync-overlay" aria-hidden="true">
        <div class="game-observer-sync-overlay-panel">
          <div class="game-observer-sync-overlay-spinner"></div>
          <div id="game-observer-sync-overlay-message" class="game-observer-sync-overlay-message">Syncing Game...</div>
          <div id="game-observer-sync-overlay-steps" class="game-observer-sync-overlay-steps"></div>
        </div>
      </div>
    </div>
  `;

  return html;
};
