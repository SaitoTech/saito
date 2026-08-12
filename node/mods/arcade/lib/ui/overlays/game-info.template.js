module.exports = (model = {}) => {
  let title = model.title || '';
  let subtitle = model.subtitle || '';
  let description = model.description || '';
  let image = model.image || '';
  let cta = model.cta || 'CREATE PUBLIC INVITE';
  let publisher = model.publisher || '';
  let has_leaderboard = !!model.hasLeaderboard;

  let art = image
    ? `<div class="art" style="background-image: url('${image}')" aria-hidden="true"></div>`
    : `<div class="art" aria-hidden="true"></div>`;

  let leaderboard = has_leaderboard
    ? `<aside class="leaderboard hide-scrollbar" aria-label="Leaderboard"></aside>`
    : '';

  let publisher_html = publisher
    ? `<div class="publisher"><span>NOTE:</span> ${publisher}</div>`
    : '';

  return `
    <div class="arcade-game-info saito-overlay-panel">
      <header class="header">
        ${art}
        <div class="identity">
          <div class="title">${title}</div>
          ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
        </div>
      </header>

      <div class="body${has_leaderboard ? ' has-leaderboard' : ''}">
        <section class="content">
          <div class="description">${description}</div>
          <div class="actions">
            <button type="button" class="saito-button-primary fat" data-action="create">${cta}</button>
          </div>
          ${publisher_html}
        </section>
        ${leaderboard}
      </div>
    </div>
  `;
};
