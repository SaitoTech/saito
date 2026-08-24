module.exports = (app, mod) => {
  return `
    <div id="saito-container" class="saito-container arcade-container">
      <aside class="saito-sidebar left arcade-sidebar-left hide-scrollbar">
        <div class="arcade-nav"></div>
      </aside>
      <div id="arcade-main" class="saito-main arcade-main">
        <div class="library hide-scrollbar">
          <div class="intersection-anchor" id="top-of-game-list"></div>
          <div class="teasers"></div>
          <div class="intersection-anchor" id="bottom-of-game-list"></div>
        </div>
      </div>
      <aside class="saito-sidebar right arcade-sidebar"></aside>
    </div>
  `;
};
