module.exports = (imperium_self, player) => {
  let cards = imperium_self.returnPlayerPlanetCards(player);
  if (!cards.length) {
    return `<div class="fs-empty">This faction does not currently control any planets.</div>`;
  }

  let html = '<div class="fs-planets">';
  for (let i = 0; i < cards.length; i++) {
    let planet = imperium_self.game.planets[cards[i]];
    if (!planet) {
      continue;
    }
    let exhausted = planet.exhausted == 1 ? ' exhausted' : '';
    let bonus = planet.bonus ? planet.bonus : '—';
    html += `
      <article class="fs-planet${exhausted}">
        <div class="fs-planet-art" style="background-image:url('${planet.img || ''}')"></div>
        <div class="fs-planet-body">
          <div class="fs-planet-name">${planet.name}</div>
          <div class="fs-planet-stats">
            <span>Resources ${planet.resources}</span>
            <span>Influence ${planet.influence}</span>
            <span>Bonus ${bonus}</span>
          </div>
          <div class="fs-planet-state">${planet.exhausted == 1 ? 'exhausted' : 'ready'}</div>
        </div>
      </article>
    `;
  }
  html += '</div>';
  return html;
};
