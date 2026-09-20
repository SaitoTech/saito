module.exports = (imperium_self, player) => {
  let pinfo = imperium_self.game.state.players_info[player - 1];
  let researched = pinfo.tech || [];

  let prereqHtml = (tech) => {
    if (!tech.prereqs || !tech.prereqs.length) {
      return '<span class="fs-prereq none">no prerequisites</span>';
    }
    return tech.prereqs
      .map((c) => `<span class="fs-prereq ${c}">${c}</span>`)
      .join('');
  };

  let renderTech = (tech, state) => {
    return `
      <article class="fs-tech fs-tech-${tech.color || 'none'} ${state}">
        <div class="fs-tech-head">
          <div class="fs-entry-title">${tech.name}</div>
          <div class="fs-tech-state">${state.replace('-', ' ')}</div>
        </div>
        <div class="fs-entry-text">${tech.text}</div>
        <div class="fs-tech-prereqs">${prereqHtml(tech)}</div>
      </article>
    `;
  };

  let abilities = [];
  let unique_owned = [];
  let unique_locked = [];
  let general = [];

  for (let i = 0; i < researched.length; i++) {
    let tech = imperium_self.tech[researched[i]];
    if (!tech) {
      continue;
    }
    if (tech.type == 'ability') {
      abilities.push(renderTech(tech, 'ability'));
    } else if (tech.type == 'special' && tech.faction == pinfo.faction) {
      unique_owned.push(renderTech(tech, 'researched'));
    } else if (tech.type != 'ability') {
      general.push(renderTech(tech, 'researched'));
    }
  }

  for (let key in imperium_self.tech) {
    let tech = imperium_self.tech[key];
    if (tech.type == 'special' && tech.faction == pinfo.faction && !researched.includes(tech.key)) {
      unique_locked.push(renderTech(tech, 'locked'));
    }
  }

  return `
    <div class="fs-tech-list">
      <section class="fs-section">
        <h3>Abilities</h3>
        ${abilities.join('') || '<div class="fs-empty">No abilities.</div>'}
      </section>
      <section class="fs-section">
        <h3>Faction technologies</h3>
        ${unique_owned.join('')}${unique_locked.join('') || ''}
        ${!unique_owned.length && !unique_locked.length ? '<div class="fs-empty">No faction technologies.</div>' : ''}
      </section>
      <section class="fs-section">
        <h3>Researched technologies</h3>
        ${general.join('') || '<div class="fs-empty">No general technologies researched.</div>'}
      </section>
    </div>
  `;
};
