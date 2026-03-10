/**
 * Template for the Game Observer loader/sync overlay only.
 * Renders inside a provided container. No HUD markup.
 */
module.exports = () => {
  return `
    <div id="observer-sync-overlay" class="game-observer-sync-overlay">
      <div class="game-observer-sync-title">Initializing Observer Mode...</div>
      <div class="game-observer-inline-spinner"></div>
      <div id="observer-sync-status" class="game-observer-sync-status">
        Checking archive for game transactions...
      </div>
    </div>
  `;
};
