module.exports = (model = {}) => {
  let title = model.title || 'Game';
  let image = model.image || '';
  let description = model.description || '';

  let hero = image ? `<img class="hero" src="${image}" alt="">` : '';
  let desc = description ? `<div class="description">${description}</div>` : '';

  return `
    <div class="arcade-teaser-install saito-overlay-panel">
      <div class="art">
        ${hero}
        <div class="content">
          <div class="title">Install ${title}</div>
          ${desc}
          <div class="message">
            Install this game as a SAITO application and add it to your Arcade.
            You can install many other games and applications as well.
          </div>
          <div class="message">
            Browse the SAITO Applications wiki to install this and other dynamic modules.
          </div>
          <button type="button" class="saito-button-primary fat" data-action="install">
            INSTALL GAME
          </button>
        </div>
      </div>
    </div>
  `;
};
