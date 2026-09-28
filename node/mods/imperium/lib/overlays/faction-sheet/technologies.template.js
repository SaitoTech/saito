const COLORS = ['blue', 'green', 'red', 'yellow'];
const FAMILIES = ['infantry', 'fighter', 'carrier', 'destroyer', 'cruiser', 'dreadnaught', 'pds', 'spacedock', 'warsun'];

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"]/g, (ch) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
  });
}

function colorCounts(mod, pinfo) {
  let counts = { blue: 0, green: 0, red: 0, yellow: 0 };
  let owned = pinfo.tech || [];
  for (let i = 0; i < owned.length; i++) {
    let tech = mod.tech[owned[i]];
    if (tech && counts[tech.color] != null) {
      counts[tech.color] += 1;
    }
  }
  for (let i = 0; i < COLORS.length; i++) {
    if (pinfo['permanent_' + COLORS[i] + '_tech_prerequisite'] == 1) {
      counts[COLORS[i]] += 1;
    }
  }
  return counts;
}

function missingPrereqs(tech, counts, pinfo) {
  let need = { blue: 0, green: 0, red: 0, yellow: 0 };
  let prereqs = tech.prereqs || [];
  for (let i = 0; i < prereqs.length; i++) {
    if (need[prereqs[i]] != null) {
      need[prereqs[i]] += 1;
    }
  }
  let missing = [];
  for (let i = 0; i < COLORS.length; i++) {
    let color = COLORS[i];
    let short = need[color] - (counts[color] || 0);
    for (let n = 0; n < short; n++) {
      missing.push(color);
    }
  }
  if (
    tech.unit != 1 &&
    missing.length == 1 &&
    pinfo.permanent_ignore_number_of_tech_prerequisites_on_nonunit_upgrade >= 1
  ) {
    missing = [];
  }
  return missing;
}

function replacedByFaction(mod, faction, key) {
  for (let other in mod.tech) {
    let tech = mod.tech[other];
    if (tech && tech.faction == faction && tech.replaces == key) {
      return true;
    }
  }
  return false;
}

function familyOf(mod, key, seen) {
  let tech = mod.tech[key];
  if (!tech) {
    return key;
  }
  if (tech.replaces && mod.tech[tech.replaces] && !seen[key]) {
    seen[key] = 1;
    return familyOf(mod, tech.replaces, seen);
  }
  if (tech.replaces) {
    return tech.replaces;
  }
  return key.replace(/-(ii|i)$/, '');
}

function pathForColor(mod, faction, color) {
  let list = [];
  for (let key in mod.tech) {
    let tech = mod.tech[key];
    if (!tech || tech.color != color || tech.unit == 1 || tech.type == 'ability') {
      continue;
    }
    if (tech.type == 'special' && tech.faction != faction) {
      continue;
    }
    if (tech.type != 'normal' && tech.type != 'special') {
      continue;
    }
    list.push({
      key: key,
      depth: (tech.prereqs || []).length,
      factional: tech.type == 'special' ? 1 : 0
    });
  }
  list.sort((a, b) => {
    return a.depth - b.depth || a.factional - b.factional || a.key.localeCompare(b.key);
  });
  return list;
}

function nextUpgrades(mod, faction, owned) {
  let groups = {};
  for (let key in mod.tech) {
    let tech = mod.tech[key];
    if (!tech || tech.unit != 1 || tech.type == 'ability') {
      continue;
    }
    if (tech.faction && tech.faction != 'all' && tech.faction != faction) {
      continue;
    }
    if (replacedByFaction(mod, faction, key)) {
      continue;
    }
    let family = familyOf(mod, key, {});
    if (!groups[family]) {
      groups[family] = [];
    }
    groups[family].push({
      key: key,
      depth: (tech.prereqs || []).length,
      factional: tech.faction && tech.faction != 'all' ? 1 : 0
    });
  }

  let families = Object.keys(groups).sort((a, b) => {
    let ia = FAMILIES.indexOf(a);
    let ib = FAMILIES.indexOf(b);
    if (ia < 0) {
      ia = 99;
    }
    if (ib < 0) {
      ib = 99;
    }
    return ia - ib || a.localeCompare(b);
  });

  let next = [];
  for (let i = 0; i < families.length; i++) {
    let items = groups[families[i]].filter((item) => {
      return owned.indexOf(item.key) == -1;
    });
    if (!items.length) {
      continue;
    }
    items.sort((a, b) => {
      return a.depth - b.depth || b.factional - a.factional;
    });
    let depth = items[0].depth;
    let at = items.filter((item) => {
      return item.depth == depth;
    });
    at.sort((a, b) => {
      return b.factional - a.factional;
    });
    next.push(at[0]);
  }
  return next;
}

function choosable(mod, player, key) {
  let research = mod.faction_sheet_overlay && mod.faction_sheet_overlay.technology_research;
  if (!research || player != mod.game.player) {
    return false;
  }
  if (typeof mod.canPlayerResearchTechnology !== 'function') {
    return false;
  }
  return !!mod.canPlayerResearchTechnology(key);
}

function nodeState(key, tech, owned, counts, pinfo) {
  if (owned.indexOf(key) != -1) {
    return 'researched';
  }
  if (missingPrereqs(tech, counts, pinfo).length == 0) {
    return 'available';
  }
  return 'future';
}

function mapModel(mod, player) {
  let pinfo = mod.game.state.players_info[player - 1];
  let faction = pinfo.faction;
  let owned = pinfo.tech || [];
  let counts = colorCounts(mod, pinfo);
  let columns = [];
  let depths = {};
  let tier_rows = {};
  for (let i = 0; i < COLORS.length; i++) {
    let color = COLORS[i];
    let tiers = {};
    let path = pathForColor(mod, faction, color);
    for (let n = 0; n < path.length; n++) {
      let item = path[n];
      let tech = mod.tech[item.key];
      if (!tiers[item.depth]) {
        tiers[item.depth] = [];
      }
      tiers[item.depth].push({
        key: item.key,
        name: tech.name,
        color: color,
        factional: item.factional,
        state: nodeState(item.key, tech, owned, counts, pinfo)
      });
      depths[item.depth] = 1;
      let rows = tiers[item.depth].length;
      if (!tier_rows[item.depth] || rows > tier_rows[item.depth]) {
        tier_rows[item.depth] = rows;
      }
    }
    columns.push({ color: color, tiers: tiers });
  }
  let tier_depths = Object.keys(depths)
    .map((depth) => {
      return Number(depth);
    })
    .sort((a, b) => {
      return a - b;
    });
  let units = nextUpgrades(mod, faction, owned).map((item) => {
    let tech = mod.tech[item.key];
    return {
      key: item.key,
      name: tech.name,
      factional: item.factional,
      state: nodeState(item.key, tech, owned, counts, pinfo)
    };
  });
  return { columns: columns, units: units, tier_depths: tier_depths, tier_rows: tier_rows };
}

function render(mod, player) {
  let model = mapModel(mod, player);
  let columns = model.columns
    .map((column) => {
      let tiers = [];
      for (let i = 0; i < model.tier_depths.length; i++) {
        let depth = model.tier_depths[i];
        let tier_nodes = column.tiers[depth] || [];
        let buttons = tier_nodes
          .map((node, index) => {
            let mark = node.factional ? '<sup class="fs-tech-faction-mark">*</sup>' : '';
            let choice = choosable(mod, player, node.key) ? ' is-choice' : '';
            let choiceTitle = choice ? ' title="you can research this"' : '';
            return `<button type="button" class="fs-tech-node is-${node.state}${choice}" style="--stack:${index + 1}" data-key="${esc(node.key)}" data-kind="tech" data-color="${esc(node.color)}"${choiceTitle}><span class="fs-tech-node-name">${esc(node.name)}${mark}</span></button>`;
          })
          .join('');
        let link = i < model.tier_depths.length - 1 ? '<div class="fs-tech-link"></div>' : '';
        tiers.push(
          `<div class="fs-tech-tier" style="--tier-rows:${model.tier_rows[depth] || 1}"><div class="fs-tech-tier-nodes">${buttons}</div>${link}</div>`
        );
      }
      return `<div class="fs-tech-col" data-color="${esc(column.color)}">${tiers.join('')}</div>`;
    })
    .join('');

  let units = model.units
    .map((unit) => {
      let classes = ['fs-upgrade', 'is-' + unit.state];
      if (unit.factional) {
        classes.push('is-faction');
      }
      if (choosable(mod, player, unit.key)) {
        classes.push('is-choice');
      }
      let mark = unit.factional ? '<sup class="fs-tech-faction-mark">*</sup>' : '';
      let choiceTitle = classes.indexOf('is-choice') >= 0 ? ' title="you can research this"' : '';
      return `<button type="button" class="${classes.join(' ')}" data-key="${esc(unit.key)}" data-kind="unit"${choiceTitle}><span class="fs-upgrade-name">${esc(unit.name)}${mark}</span></button>`;
    })
    .join('');

  return `
    <div class="fs-techmap">
      <div class="fs-techmap-board">
        <div class="fs-tech-columns">${columns}</div>
        <div class="fs-upgrades">${units}</div>
      </div>
      <aside class="fs-tech-detail from-right" aria-hidden="true">
        <button type="button" class="fs-tech-detail-close">close</button>
        <div class="fs-tech-detail-body"></div>
        <div class="fs-tech-detail-action"></div>
      </aside>
    </div>
  `;
}

render.model = mapModel;
render.missingPrereqs = missingPrereqs;
render.colorCounts = colorCounts;
render.colors = COLORS;
module.exports = render;
