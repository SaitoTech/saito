module.exports = (imperium_self, attacker, defender, sector, planet_idx, overlay_html) => {
  let sys = imperium_self.returnSectorAndPlanets(sector);
  let planet = sys.p[planet_idx];
  let attacker_forces = planet.units[attacker - 1];
  let defender_forces = planet.units[defender - 1];

  let renderForces = (player, forces, side) => {
    let html = '';
    for (let i = 0; i < forces.length; i++) {
      let unit = forces[i];
      if (unit.strength <= 0 || unit.destroyed == 1) {
        continue;
      }

      let damaged = unit.max_strength && unit.strength < unit.max_strength;
      let unitName = `<div class="ground-battle-unit-name">${unit.name}${damaged ? ' (damaged)' : ''}</div>`;
      let unitIcon = `<div class="ground-battle-unit-icon unit-box-ship unit-box-ship-${unit.type}"></div>`;
      let hitsOn = `
        <div class="ground-battle-unit-combat"><strong>${unit.combat}+</strong><span>hits on</span></div>
      `;
      let rolls = '<div class="ground-battle-unit-rolls">';
      for (let shot = 0; shot < unit.shots; shot++) {
        rolls += `
          <div class="ground-battle-shot player-${player}-ship-${i}-shot-${shot}">
            <div class="dice-results"><span class="unit-box-num">?</span></div>
          </div>
        `;
      }
      rolls += '</div>';

      html += `
        <div class="ground-battle-unit ${side}" data-player="${player}" data-unit-index="${i}">
          ${side === 'left' ? `${unitIcon}${unitName}${hitsOn}${rolls}` : `${rolls}${hitsOn}${unitName}${unitIcon}`}
        </div>
      `;
    }

    return html || '<div class="ground-combat-empty">No ground forces remaining</div>';
  };

  let viewer = parseInt(imperium_self.game.player, 10);
  let leftPlayer = parseInt(defender, 10) === viewer ? defender : attacker;
  let rightPlayer = leftPlayer === attacker ? defender : attacker;
  let leftForces = leftPlayer === attacker ? attacker_forces : defender_forces;
  let rightForces = rightPlayer === attacker ? attacker_forces : defender_forces;
  let leftTitle = leftPlayer === attacker ? 'ATTACKING FORCES' : 'DEFENDING FORCES';
  let rightTitle = rightPlayer === attacker ? 'ATTACKING FORCES' : 'DEFENDING FORCES';

  return `
    <section class="ground-combat-overlay">
      <header class="ground-combat-header">
        <div class="ground-combat-heading">
          <span>GROUND COMBAT</span><i>—</i><strong>${planet.name}</strong>
        </div>
        <div class="ground-combat-header-tools">
          <div class="ground-combat-round">round ${imperium_self.game.state.ground_combat_round || 1}</div>
          <button type="button" class="saito-overlay-closebox" aria-label="Hide combat"><i class="fas fa-times-circle saito-overlay-closebox-btn"></i></button>
        </div>
      </header>
      <div class="ground-combat-units">
        <section class="ground-combat-fleet ground-combat-left" data-player="${leftPlayer}">
          <div class="ground-combat-fleet-title">
            <span>${leftTitle}</span>
            <strong>${imperium_self.returnFactionName(imperium_self, leftPlayer)}</strong>
          </div>
          <div class="ground-combat-fleet-list">${renderForces(leftPlayer, leftForces, 'left')}</div>
        </section>
        <section class="ground-combat-center">
          <div class="ground-combat-menu">${overlay_html || '<div class="ground-combat-awaiting">Combat resolution</div>'}</div>
        </section>
        <section class="ground-combat-fleet ground-combat-right" data-player="${rightPlayer}">
          <div class="ground-combat-fleet-title">
            <span>${rightTitle}</span>
            <strong>${imperium_self.returnFactionName(imperium_self, rightPlayer)}</strong>
          </div>
          <div class="ground-combat-fleet-list">${renderForces(rightPlayer, rightForces, 'right')}</div>
        </section>
      </div>
    </section>
  `;
};
