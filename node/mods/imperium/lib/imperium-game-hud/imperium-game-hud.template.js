module.exports = () => {
  return `
    <div id="game-hud2" class="game-hud2 imperium-game-hud">
      <div class="hud-notice"></div>
      <div id="hud-visual-menu" class="hud-visual-menu"></div>
      <div class="hud-status" aria-live="polite"></div>
      <div class="imperium-hud-frame is-menu">
        <div class="imperium-hud-header">
          <div class="hud-back-button"></div>
          <span class="imperium-hud-swatch"></span>
          <div class="imperium-hud-heading">
            <span class="imperium-hud-faction"></span><span class="imperium-hud-colon">: </span><span class="imperium-hud-instruction"></span>
          </div>
          <button type="button" class="imperium-hud-combat-toggle" hidden>show combat</button>
        </div>
        <div class="hud-menu"></div>
      </div>
      <div class="hud-cards"></div>
    </div>
  `;
};
