module.exports = (
  mod,
  attacker,
  defender,
  sector,
  overlay_html,
  stage = 'space_combat',
  combat_info = null
) => {
  let sys = mod.returnSectorAndPlanets(sector);
  let attacker_ships = sys.s.units[attacker - 1];
  let defender_ships = sys.s.units[defender - 1];
  let sector_name = sys.s.name;
  let isBarrage = stage === 'anti_fighter_barrage';
  let renderFleet = (player, ships, side) => {
    let html = '';
    for (let i = 0; i < ships.length; i++) {
      let unit = ships[i];
      let destroyed = unit.strength <= 0 || unit.destroyed == 1;
      let damaged = !destroyed && unit.strength < unit.max_strength;
      let shipName = `<div class="battle-unit-name">${unit.name}${destroyed ? ' (destroyed)' : damaged ? ' (damaged)' : ''}</div>`;
      let shipIcon = `<div class="battle-unit-icon unit-box-ship unit-box-ship-${unit.type}"></div>`;
      let shots = isBarrage
        ? combat_info && combat_info.attacker === player
          ? combat_info.ship_idx.filter((shipIndex) => shipIndex === i).length
          : 0
        : destroyed ? 0 : unit.shots;
      let hitsOn = '';
      let rolls = '';

      if (!isBarrage || shots > 0) {
        let combat = isBarrage ? unit.anti_fighter_barrage_combat : unit.combat;
        hitsOn = `
          <div class="battle-unit-combat"><strong>${combat}+</strong><span>hits on</span></div>
        `;
        rolls = '<div class="battle-unit-rolls">';
        for (let shot = 0; shot < shots; shot++) {
          rolls += `
            <div class="battle-shot player-${player}-ship-${i}-shot-${shot}">
              <div class="dice-results"><span class="unit-box-num">?</span></div>
            </div>
          `;
        }
        rolls += '</div>';
      } else if (isBarrage) {
        hitsOn = '<div class="battle-unit-combat-placeholder"></div>';
        rolls = '<div class="battle-unit-rolls-placeholder"></div>';
      }

      html += `
        <div class="battle-unit ${side} player-${player}-ship-${i}${damaged ? ' is-damaged' : ''}${destroyed ? ' is-destroyed' : ''}" data-player="${player}" data-ship-index="${i}"${destroyed ? ' aria-disabled="true"' : ''}>
          ${side === 'left' ? `${shipIcon}${shipName}${hitsOn}${rolls}` : `${rolls}${hitsOn}${shipName}${shipIcon}`}
        </div>
      `;
    }
    return html || '<div class="battle-empty-fleet">No ships remaining</div>';
  };

  let viewer = parseInt(mod.game.player, 10);
  let leftPlayer = parseInt(defender, 10) === viewer ? defender : attacker;
  let rightPlayer = leftPlayer === attacker ? defender : attacker;
  let leftShips = leftPlayer === attacker ? attacker_ships : defender_ships;
  let rightShips = rightPlayer === attacker ? attacker_ships : defender_ships;
  let leftTitle = leftPlayer === attacker ? 'ATTACKING FLEET' : 'DEFENDING FLEET';
  let rightTitle = rightPlayer === attacker ? 'ATTACKING FLEET' : 'DEFENDING FLEET';
  let title = isBarrage ? 'ANTI-FIGHTER BARRAGE' : 'SPACE COMBAT';

  return `
    <section class="space-combat-overlay ${isBarrage ? 'is-anti-fighter-barrage' : ''}">
      <header class="space-combat-header">
        <div class="space-combat-heading"><span>${title}</span><i>—</i><strong>${sector_name}</strong></div>
        <div class="space-combat-header-tools">
          <div class="space-combat-round">round ${mod.game.state.space_combat_round || 1}</div>
          <button type="button" class="saito-overlay-closebox" aria-label="Hide combat"><i class="fas fa-times-circle saito-overlay-closebox-btn"></i></button>
        </div>
      </header>
      <div class="space-combat-units">
        <section class="space-combat-fleet space-combat-left" data-player="${leftPlayer}">
          <div class="space-combat-fleet-title"><span>${leftTitle}</span><strong>${mod.returnFactionName(mod, leftPlayer)}</strong></div>
          <div class="space-combat-fleet-list">${renderFleet(leftPlayer, leftShips, 'left')}</div>
        </section>
        <section class="space-combat-center">
          <div class="space-combat-menu">${overlay_html || '<div class="space-combat-status">waiting for opponent...</div>'}</div>
        </section>
        <section class="space-combat-fleet space-combat-right" data-player="${rightPlayer}">
          <div class="space-combat-fleet-title"><span>${rightTitle}</span><strong>${mod.returnFactionName(mod, rightPlayer)}</strong></div>
          <div class="space-combat-fleet-list">${renderFleet(rightPlayer, rightShips, 'right')}</div>
        </section>
      </div>
    </section>
  `;
};
