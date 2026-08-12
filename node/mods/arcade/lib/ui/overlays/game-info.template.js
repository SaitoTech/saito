module.exports = (model = {}) => {
  let title = model.title || '';
  let image = model.image || '';
  let has_leaderboard = !!model.hasLeaderboard;

  let leaderboard = has_leaderboard
    ? `<aside class="leaderboard hide-scrollbar" aria-label="Leaderboard"></aside>`
    : '';

  let hero = image ? `<img class="hero" src="${image}" alt="">` : '';

  return `
    <div class="arcade-game-info saito-overlay-panel${has_leaderboard ? ' has-leaderboard' : ''}">
      <div class="art">
        ${hero}
        <div class="banner">
          <div class="title">${title}</div>
          <button type="button" class="saito-button-primary create" data-action="create">+ New Game</button>
        </div>
      </div>
      ${leaderboard}
    </div>
  `;
};
