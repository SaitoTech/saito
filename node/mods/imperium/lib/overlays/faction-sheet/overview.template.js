module.exports = (imperium_self, player) => {
  let pinfo = imperium_self.game.state.players_info[player - 1];
  let faction = imperium_self.returnFactions()[pinfo.faction];
  if (!faction) {
    return '';
  }

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

  let lines = String(faction.intro || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && !/^welcome to red imperium!$/i.test(s));
  let description = lines.join(' ');

  let art = faction.background
    ? `url('/imperium/img/factions/${faction.background}')`
    : 'none';

  let items = (list) =>
    list
      .map(
        (t) => `
        <div class="fs-ability-item">
          <div class="fs-ability-name">${t.name}</div>
          <p class="fs-ability-text">${t.text || ''}</p>
        </div>`
      )
      .join('');

  let card = (kicker, list) => {
    if (!list.length) {
      return '';
    }
    return `
      <article class="fs-ability">
        <div class="fs-ability-kicker">${kicker}</div>
        ${items(list)}
      </article>`;
  };

  return `
    <div class="fs-overview">
      <header class="fs-identity" style="--fs-art:${art}">
        <div class="fs-identity-name">${faction.name}</div>
        ${description ? `<p class="fs-identity-text">${description}</p>` : ''}
      </header>
      <div class="fs-abilities">
        ${card('Faction Ability', abilities)}
        ${card('Flagship Ability', flagship ? [flagship] : [])}
        ${card('Unique Technology', specials)}
      </div>
    </div>
  `;
};
