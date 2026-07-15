module.exports = LimboMainTemplate = (app, mod) => {
  let html = `
    <div id="saito-container" class="saito-container limbo-container">
      <div id="limbo-main" class="saito-main limbo-main">
        <div class="limbo-menu limbo-splash-box saito-cta">
          <div class="saito-cta-logo limbo-splash-logo" role="img" aria-label="Swarmcast"></div>
          <div class="limbo-splash-subtitle">Peer to Peer Streaming</div>
          <div class="limbo-launch-options">`;
  if (!app.browser.isMobileBrowser()) {
    html += `<button class="limbo-option" id="screen" type="button"><i class="fa-solid ${mod.icons.screen}"></i><span>Screencast</span></button>`;
  }
  html += `<button class="limbo-option" id="audio" type="button"><i class="fa-solid ${mod.icons.audio}"></i><span>Voicecast</span></button>
            <button class="limbo-option" id="video" type="button"><i class="fa-solid ${mod.icons.camera}"></i><span>Videocast</span></button>
          </div>
          <div class="space-list-header"></div>
          <div id="spaces" class="spaces-list"></div>
        </div>
      </div>
      <div class="saito-sidebar right"></div>
    </div>
  `;

  return html;
};
