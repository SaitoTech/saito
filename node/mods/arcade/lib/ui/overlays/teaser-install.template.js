module.exports = (model = {}) => {
  let title = model.title || 'Game';
  let image = model.image || '';

  let hero = image ? `<img class="hero" src="${image}" alt="">` : '';
  let artwork = image ? `<img class="artwork" src="${image}" alt="">` : '';

  return `
    <div class="arcade-teaser-install saito-overlay-panel">
      <div class="art">
        ${hero}
        <div class="stage">
          ${artwork}
          <div class="panel">
            <div class="title">Install ${title}</div>
            <div class="message">
              This game module is open source. You can download it and many other
              games for free from the Saito Wiki. Click the button below to visit
              the Wiki.
            </div>
            <button type="button" class="saito-button-primary fat" data-action="install">
              VISIT SAITO WIKI
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
};
