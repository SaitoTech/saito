module.exports = (app, mod) => {
  return `
    <div id="saito-container" class="saito-container arcade-container">
      <div id="arcade-main" class="saito-main arcade-main">
        <div id="arcade-central-panel" class="arcade-central-panel">
          <div class="intersection-anchor" id="top-of-game-list"></div>
          <div class="arcade-teasers"></div>
          <div class="intersection-anchor" id="bottom-of-game-list"></div>
        </div>
      </div>
      <div class="saito-sidebar right arcade-sidebar"></div>
    </div>
  `;
};
