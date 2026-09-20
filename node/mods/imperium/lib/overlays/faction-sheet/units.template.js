module.exports = (imperium_self, player) => {
  let pinfo = imperium_self.game.state.players_info[player - 1];
  let faction = imperium_self.returnFactions()[pinfo.faction];

  let count = (list) => {
    let c = {};
    for (let i = 0; i < list.length; i++) {
      c[list[i]] = (c[list[i]] || 0) + 1;
    }
    return c;
  };

  let renderGroup = (title, counts) => {
    let keys = Object.keys(counts);
    if (!keys.length) {
      return '';
    }
    let rows = keys
      .map((type) => {
        let unit = imperium_self.units[type] ? imperium_self.returnUnit(type, player) : null;
        let name = unit ? unit.name : type;
        let combat = unit && unit.combat ? `combat ${unit.combat}` : '';
        let move = unit && unit.move ? `move ${unit.move}` : '';
        let meta = [combat, move].filter((x) => x).join(' · ');
        return `
          <div class="fs-unit-row">
            <div class="fs-unit-name">${counts[type]}× ${name}</div>
            <div class="fs-unit-meta">${meta}</div>
          </div>`;
      })
      .join('');
    return `<section class="fs-section"><h3>${title}</h3>${rows}</section>`;
  };

  let upgrades = [];
  for (let key in imperium_self.tech) {
    let tech = imperium_self.tech[key];
    if (tech.unit == 1 && tech.faction == pinfo.faction) {
      let owned = pinfo.tech.includes(tech.key);
      upgrades.push(`
        <div class="fs-entry ${owned ? 'is-researched' : 'is-locked'}">
          <div class="fs-entry-title">${tech.name}</div>
          <div class="fs-entry-text">${tech.text}</div>
        </div>`);
    }
  }

  return `
    <div class="fs-units">
      ${renderGroup('Starting space forces', count(faction.space_units || []))}
      ${renderGroup('Starting ground forces', count(faction.ground_units || []))}
      <section class="fs-section">
        <h3>Faction units</h3>
        ${upgrades.join('') || '<div class="fs-empty">No faction-specific units recorded.</div>'}
      </section>
    </div>
  `;
};
