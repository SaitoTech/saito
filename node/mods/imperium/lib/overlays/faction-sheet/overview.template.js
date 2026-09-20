module.exports = (imperium_self, player) => {
  let pinfo = imperium_self.game.state.players_info[player - 1];
  let faction = imperium_self.returnFactions()[pinfo.faction];
  let abilities = [];
  let flagship = null;
  let specials = [];

  for (let i = 0; i < pinfo.tech.length; i++) {
    let tech = imperium_self.tech[pinfo.tech[i]];
    if (tech && tech.type == 'ability') {
      if (tech.key && tech.key.indexOf('flagship') >= 0) {
        flagship = tech;
      } else {
        abilities.push(tech);
      }
    }
  }

  for (let key in imperium_self.tech) {
    let tech = imperium_self.tech[key];
    if (tech.type == 'special' && tech.faction == pinfo.faction) {
      specials.push(tech);
    }
  }

  let ability_html = abilities
    .map(
      (t) => `
      <div class="fs-entry">
        <div class="fs-entry-title">${t.name}</div>
        <div class="fs-entry-text">${t.text}</div>
      </div>`
    )
    .join('');

  let flagship_html = flagship
    ? `
      <div class="fs-entry">
        <div class="fs-entry-title">${flagship.name}</div>
        <div class="fs-entry-text">${flagship.text}</div>
      </div>`
    : `<div class="fs-empty">No flagship ability on file.</div>`;

  let special_html = specials
    .map((t) => {
      let owned = pinfo.tech.includes(t.key);
      return `
      <div class="fs-entry ${owned ? 'is-researched' : 'is-locked'}">
        <div class="fs-entry-title">${t.name}</div>
        <div class="fs-entry-text">${t.text}</div>
      </div>`;
    })
    .join('');

  return `
    <div class="fs-overview">
      <div class="fs-intro">${faction.intro || ''}</div>
      <div class="fs-overview-grid">
        <section class="fs-section">
          <h3>Faction abilities</h3>
          ${ability_html || '<div class="fs-empty">No faction abilities recorded.</div>'}
        </section>
        <section class="fs-section">
          <h3>Flagship</h3>
          ${flagship_html}
        </section>
        <section class="fs-section">
          <h3>Unique technologies</h3>
          ${special_html || '<div class="fs-empty">No unique technologies recorded.</div>'}
        </section>
      </div>
    </div>
  `;
};
