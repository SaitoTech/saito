module.exports = (app, mod) => {
  const cta = mod.show_splash
    ? `
          <section class="arcade-cta-section">
            <div class="arcade-cta-card saito-cta">
              <div class="arcade-cta-image-flip">
                <div class="arcade-cta-image-front">
                  <img src="/arcade/img/arcade-hero.png" alt="Saito Arcade" />
                </div>
                <div class="arcade-cta-image-back">
                  <div class="arcade-cta-image-back-content">
                    <h3>Play Without Platforms</h3>
                    <p>The Saito Arcade is an online hub for the peer-to-peer games, web3, and video apps that run on Saito. Play any game to automatically join the leaderboard!</p>
                  </div>
                </div>
              </div>
              <div class="arcade-cta-content">
                <div class="arcade-cta-logo" role="img" aria-label="Saito Arcade"></div>
                <div class="arcade-cta-subtitle">PEER-TO-PEER,  PROVABLY FAIR, FUN</div>
                <button class="saito-button-primary arcade-cta-play-btn" id="arcade-play-now-btn" type="button">Play Now</button>
              </div>
            </div>
          </section>`
    : '';

  return `
    <div id="saito-container" class="saito-container arcade-container">
      <div id="arcade-main" class="saito-main arcade-main">
        <div id="arcade-central-panel" class="arcade-central-panel hide-scrollbar">
          ${cta}
          <div class="intersection-anchor" id="top-of-game-list"></div>
          <div class="arcade-teasers"></div>
          <div class="intersection-anchor" id="bottom-of-game-list"></div>
        </div>
      </div>
      <div class="saito-sidebar right arcade-sidebar"></div>
    </div>
  `;
};
