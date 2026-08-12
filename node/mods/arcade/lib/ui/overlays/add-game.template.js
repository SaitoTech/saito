module.exports = (model = {}) => {
  let view = model.view || 'home';
  let title = model.title || 'Add Game';
  let subtitle = model.subtitle || '';
  let can_back = !!model.canBack;

  let nav = `
    <div class="nav">
      ${
        can_back
          ? `<button type="button" class="nav-btn" data-nav="back" aria-label="Back">Back</button>`
          : `<span class="nav-spacer"></span>`
      }
      <div class="heading">
        <div class="lede">${title}</div>
        ${subtitle ? `<div class="text">${subtitle}</div>` : ''}
      </div>
      <button type="button" class="nav-btn" data-nav="close" aria-label="Close">Close</button>
    </div>
  `;

  if (view === 'home') {
    let options = model.options || [];
    let cards = options
      .map((option) => {
        let image = option.image || '/saito/img/dreamscape.png';
        let otitle = option.title || '';
        let description = option.description || '';
        let id = option.id || '';
        return `
          <button type="button" class="choice" data-action="${id}">
            <div class="art">
              <img src="${image}" alt="" />
            </div>
            <div class="meta">
              <div class="lede">${otitle}</div>
              <div class="text">${description}</div>
            </div>
          </button>`;
      })
      .join('');

    return `
      <div class="arcade-add-game saito-overlay-form" data-view="home">
        <div class="body">
          ${nav}
          <div class="choices" data-count="${options.length}">
            ${cards}
          </div>
        </div>
      </div>
    `;
  }

  if (view === 'free') {
    let games = model.games || [];
    let cards = games
      .map((game) => {
        let image = game.image || '/saito/img/dreamscape.png';
        let art = image
          ? `style="background-image: url('${image}')"`
          : '';
        return `
          <button type="button" class="game-choice" data-id="${game.id}" data-href="${game.href || ''}">
            <div class="art" ${art} aria-hidden="true"></div>
            <div class="meta">
              <div class="lede">${game.title || ''}</div>
            </div>
          </button>`;
      })
      .join('');

    return `
      <div class="arcade-add-game saito-overlay-form" data-view="free">
        <div class="body">
          ${nav}
          <div class="game-list" data-count="${games.length}">
            ${cards || `<div class="empty">${subtitle || 'No games available.'}</div>`}
          </div>
        </div>
      </div>
    `;
  }

  // sale / rent / unknown placeholders — same chrome, ready for deeper Store wiring
  let cta = model.cta
    ? `<button type="button" class="saito-button-primary" data-nav="store">${model.cta}</button>`
    : '';

  return `
    <div class="arcade-add-game saito-overlay-form" data-view="${view}">
      <div class="body">
        ${nav}
        <div class="placeholder">
          <div class="text">${subtitle || ''}</div>
          ${cta}
        </div>
      </div>
    </div>
  `;
};
