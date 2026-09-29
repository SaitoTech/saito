const ReplacementsTemplate = require('./replacements.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ReplacementsOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visible = false;
    this.selectedAction = '';
    // Standard Saito closebox; keep host alive across re-renders after each spend.
    // closebox=true, removeOnClose=false, clickToClose=false
    this.overlay = new SaitoOverlay(app, mod, true, false, false);
  }

  onOverlayClose() {
    this.visible = false;
    this.selectedAction = '';
  }

  hide() {
    this.mod.game.status = 'submitting...';
    this.mod.hud.updateStatus(this.mod.game.status);
    this.mod.hud.updateMenu([]);
    this.mod.hud.updateCards([]);
    this.visible = false;
    this.selectedAction = '';
    this.overlay.callback_on_close = null;
    this.overlay.hide();
  }

  softClose() {
    this.onOverlayClose();
    this.overlay.hide();
  }

  pullHudOverOverlay() {
    let overlay_zindex = parseInt(this.overlay.zIndex);
    let hud = document.getElementById('game-hud2');
    if (hud) {
      hud.style.zIndex = overlay_zindex + 1;
    }
  }

  pushHudUnderOverlay() {
    let overlay_zindex = parseInt(this.overlay.zIndex);
    let hud = document.getElementById('game-hud2');
    if (hud) {
      hud.style.zIndex = overlay_zindex - 2;
    }
  }

  viewingPlayerPower() {
    return this.mod.returnFactionOfPlayer() || '';
  }

  rootEl() {
    return document.querySelector('.replacements-overlay');
  }

  syncPlayerHeader() {
    let root = this.rootEl();
    let icon = document.querySelector('.replacements-overlay .rp-header-icon');
    let power = this.viewingPlayerPower();
    if (root) {
      root.classList.remove('is-central', 'is-allies');
      if (power === 'central') {
        root.classList.add('is-central');
      } else if (power) {
        root.classList.add('is-allies');
      }
      root.dataset.faction = power || '';
    }
    if (icon) {
      icon.dataset.faction = power || '';
    }
  }

  isCorpsUnit(unit) {
    if (!unit) {
      return false;
    }
    if (unit.key && unit.key.indexOf('army') > -1) {
      return false;
    }
    if (unit.key && unit.key.indexOf('corps') > -1) {
      return true;
    }
    if (unit.corps) {
      return true;
    }
    if (unit.army) {
      return false;
    }
    return false;
  }

  ensureHost() {
    // Always refresh from template so stale nodes (e.g. old submenu-status) cannot linger.
    let onClose = () => this.onOverlayClose();
    this.overlay.show(ReplacementsTemplate(), onClose);
    return this.rootEl();
  }

  renderPoints() {
    let paths_self = this.mod;
    let faction = this.viewingPlayerPower();
    let pts = document.querySelector('.replacements-overlay .points');
    if (!pts) {
      return;
    }
    pts.innerHTML = '';
    for (let key in paths_self.game.state.rp[faction]) {
      if (paths_self.game.state.rp[faction][key] > 0) {
        pts.innerHTML += `
		      <div class="box">
		        <div class="ckey">${key}</div>
		        <div class="num">${paths_self.game.state.rp[faction][key]}</div>
		      </div>
		    `;
      }
    }
  }

  markSelectedAction(id = '') {
    this.selectedAction = id || '';
    document.querySelectorAll('.replacements-overlay .mainmenu .controls .option').forEach((el) => {
      el.classList.toggle('is-selected', el.id === this.selectedAction);
    });
  }

  renderActions() {
    let paths_self = this.mod;
    let obk = document.querySelector('.replacements-overlay .mainmenu .controls');
    if (!obk) {
      return;
    }
    let html = '<ul>';
    for (let z = 0; z < paths_self.game.state.replacements.options.length; z++) {
      let opt = paths_self.game.state.replacements.options[z];
      opt = opt.replace(
        /<li class="option" id="([^"]+)">([^<]*)<\/li>/,
        (match, id, label) =>
          `<li class="option" id="${id}"><span class="rp-action-label">${label}</span><span class="rp-chevron" aria-hidden="true">&gt;</span></li>`
      );
      html += opt;
    }
    html += '</ul>';
    obk.innerHTML = html;

    document.querySelectorAll('.replacements-overlay .mainmenu .controls ul li').forEach((el) => {
      el.onclick = (e) => {
        let id = e.currentTarget.id;

        if (id == 'finish') {
          this.hide();
          paths_self.endTurn();
          return 1;
        }

        this.markSelectedAction(id);
        this.showSubMenu(id);
      };
    });
  }

  render() {
    let paths_self = this.mod;

    paths_self.game.state.is_movement_from_outside_near_east = true;

    this.visible = true;
    this.selectedAction = '';
    this.ensureHost();
    this.syncPlayerHeader();
    this.renderPoints();
    this.renderActions();

    let submenu = document.querySelector('.replacements-overlay .submenu');
    if (submenu) {
      submenu.classList.remove('is-open');
      let controls = submenu.querySelector('.controls');
      if (controls) {
        controls.innerHTML = '';
      }
    }
  }

  hideSubMenu() {
    try {
      let submenu = document.querySelector('.replacements-overlay .submenu');
      if (submenu) {
        submenu.classList.remove('is-open');
      }
      this.markSelectedAction('');
    } catch (err) {}
  }

  showSubMenu(id = 'uneliminate') {
    let paths_self = this.mod;
    document.querySelectorAll('.replacements-overlay .submenu-status').forEach((el) => el.remove());
    let eu = paths_self.game.state.replacements.can_uneliminate_unit_array;
    if (id == 'repair_board') {
      eu = paths_self.game.state.replacements.can_repair_unit_on_board_array;
    }
    if (id == 'repair_reserves') {
      eu = paths_self.game.state.replacements.can_repair_unit_in_reserves_array;
    }
    if (id == 'deploy') {
      let units_available = {};
      eu = paths_self.game.state.replacements.can_deploy_unit_in_reserves_array;
      for (let i = eu.length - 1; i >= 0; i--) {
        let u = paths_self.game.spaces[eu[i].key].units[eu[i].idx];
        if (!paths_self.doReplacementPointsExistForUnit(u)) {
          eu.splice(i, 1);
        } else {
          if (!units_available[eu[i].name]) {
            units_available[eu[i].name] = 1;
          } else {
            eu.splice(i, 1);
          }
        }
      }
    }

    let obk = document.querySelector('.replacements-overlay .submenu .controls');
    let html = '<ul>';
    for (let z = 0; z < eu.length; z++) {
      let entry = eu[z];
      let unit = paths_self.game.spaces[entry.key].units[entry.idx];
      let loc = paths_self.game.spaces[entry.key].name;
      let type_class = this.isCorpsUnit(unit) ? 'is-corps' : 'is-army';
      let chit = paths_self.returnUnitImage(unit);
      html += `<li class="option rp-unit-row ${type_class}" id="${z}" data-key="${unit.key || ''}">
        <div class="rp-unit-chit">${chit}</div>
        <div class="rp-unit-meta"><span class="rp-unit-name">${entry.ckey} ${entry.name}</span><span class="rp-unit-loc">${loc}</span></div>
        <span class="rp-chevron" aria-hidden="true">&gt;</span>
      </li>`;
    }
    html += '</ul>';
    obk.innerHTML = html;

    document.querySelectorAll('.replacements-overlay .submenu .controls ul li').forEach((el) => {
      el.onclick = (e) => {
        let z = parseInt(e.currentTarget.id);
        let unit = paths_self.game.spaces[eu[z].key].units[eu[z].idx];
        let faction = paths_self.returnFactionOfPlayer();

        //
        // recreated armies are placed as reinforcements (17.1.5 / 9.5.3.3)
        //
        let army_spacekeys = [];
        if (id == 'uneliminate' && !unit.corps) {
          let country = '';
          if (unit.ckey == 'GE') { country = 'germany'; }
          if (unit.ckey == 'AH') { country = 'austria'; }
          if (unit.ckey == 'BU' || unit.ckey == 'BG') { country = 'bulgaria'; }
          if (unit.ckey == 'FR') { country = 'france'; }
          if (unit.ckey == 'IT') { country = 'italy'; }
          if (unit.ckey == 'RO') { country = 'romania'; }
          if (unit.ckey == 'RU') { country = 'russia'; }
          if (unit.ckey == 'SB') { country = 'serbia'; }
          if (unit.ckey == 'US') { country = 'usa'; }
          if (unit.ckey == 'BR' || unit.ckey == 'BEF' || unit.ckey == 'AUS' || unit.ckey == 'CND' || unit.ckey == 'PT' || unit.ckey == 'ANA' || unit.ckey == 'MEF' || unit.ckey == 'NE') { country = 'england'; }
          army_spacekeys = paths_self.returnArrayOfSpacekeysForPlacingReinforcements(country);
          if (army_spacekeys.length == 0) {
            alert('Error -- no viable placement options?');
            return;
          }
        }

        //
        // deduct RP
        //
        if (paths_self.game.state.rp[faction][unit.ckey] > 0) {
          paths_self.game.state.rp[faction][unit.ckey]--;
        } else {
          if (paths_self.game.state.rp[faction]['CP'] > 0) {
            paths_self.game.state.rp[faction]['CP']--;
          } else {
            if (paths_self.game.state.rp[faction]['AP'] > 0) {
              paths_self.game.state.rp[faction]['AP']--;
            } else {
              if (paths_self.game.state.rp[faction]['A'] > 0) {
                paths_self.game.state.rp[faction]['A']--;
              } else {
                alert('You do not seem to have enough RPs to treat that unit...');
                return;
              }
            }
          }
        }

        if (id == 'uneliminate') {
          paths_self.game.spaces[eu[z].key].units[eu[z].idx].destroyed = 0;
          paths_self.game.spaces[eu[z].key].units[eu[z].idx].damaged = 1;
          if (unit.corps) {
            if (paths_self.returnFactionOfPlayer() == 'central') {
              paths_self.moveUnit(eu[z].key, eu[z].idx, 'crbox');
              paths_self.prependMove(
                `NOTIFY\t${paths_self.returnFactionName(faction)} uneliminates ${unit.name}`
              );
              paths_self.prependMove(
                `repair\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${paths_self.game.player}`
              );
              paths_self.prependMove(
                `move\t${faction}\t${eu[z].key}\t${eu[z].idx}\tcrbox\t${paths_self.game.player}`
              );
            } else {
              paths_self.moveUnit(eu[z].key, eu[z].idx, 'arbox');
              paths_self.prependMove(
                `NOTIFY\t${paths_self.returnFactionName(faction)} uneliminates ${unit.name}`
              );
              paths_self.prependMove(
                `repair\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${paths_self.game.player}`
              );
              paths_self.prependMove(
                `move\t${faction}\t${eu[z].key}\t${eu[z].idx}\tarbox\t${paths_self.game.player}`
              );
            }
            paths_self.displaySpace(eu[z].key);
            paths_self.displaySpace('arbox');
            paths_self.displaySpace('crbox');
            paths_self.playerSpendReplacementPoints(paths_self.returnFactionOfPlayer());
          } else {
            let place_army = (spacekey) => {
              paths_self.moveUnit(eu[z].key, eu[z].idx, spacekey);
              paths_self.prependMove(
                `NOTIFY\t${paths_self.returnFactionName(faction)} uneliminates ${unit.name}`
              );
              paths_self.prependMove(
                `repair\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${paths_self.game.player}`
              );
              paths_self.prependMove(
                `move\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${spacekey}\t${paths_self.game.player}`
              );
              paths_self.displaySpace(eu[z].key);
              paths_self.displaySpace(spacekey);
              if (army_spacekeys.length == 1) {
                siteMessage(`${unit.name} returns to ${paths_self.returnSpaceName(spacekey)}, damaged`, 2500);
              }
              paths_self.playerSpendReplacementPoints(paths_self.returnFactionOfPlayer());
            };

            if (army_spacekeys.length == 1) {
              place_army(army_spacekeys[0]);
            } else {
              this.hideSubMenu();
              paths_self.playerSelectSpaceWithFilter(
                `Destination for ${unit.name}`,
                (spacekey) => { if (army_spacekeys.includes(spacekey)) { return 1; } return 0; },
                place_army,
                null,
                true
              );
            }
          }
        }
        if (id == 'repair_reserves') {
          paths_self.game.spaces[eu[z].key].units[eu[z].idx].damaged = 0;
          paths_self.prependMove(
            `NOTIFY\t${paths_self.returnFactionName(faction)} repairs ${unit.name} (reserves)`
          );
          paths_self.prependMove(
            `repair\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${paths_self.game.player}`
          );
          paths_self.displaySpace(eu[z].key);
          paths_self.playerSpendReplacementPoints(paths_self.returnFactionOfPlayer());
        }
        if (id == 'repair_board') {
          paths_self.game.spaces[eu[z].key].units[eu[z].idx].damaged = 0;
          paths_self.prependMove(
            `NOTIFY\t${paths_self.returnFactionName(faction)} repairs ${unit.name} (${paths_self.returnSpaceNameForLog(eu[z].key)})`
          );
          paths_self.prependMove(
            `repair\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${paths_self.game.player}`
          );
          paths_self.displaySpace(eu[z].key);
          paths_self.playerSpendReplacementPoints(paths_self.returnFactionOfPlayer());
        }
        if (id == 'deploy') {
          this.hideSubMenu();

          paths_self.game.state.does_movement_start_outside_near_east = 1;
          paths_self.game.state.does_movement_start_inside_near_east = 0;

          paths_self.playerSelectSpaceWithFilter(
            `Destination for ${unit.name}`,

            (spacekey) => {
              if (paths_self.game.spaces[spacekey].control == faction) {
                if (spacekey == 'belgrade' && unit.ckey == 'SB') {
                  if (paths_self.game.spaces['nis'].control == 'central') {
                    return 0;
                  }
                }

                if (paths_self.game.spaces[spacekey].besieged == 1) {
                  return 0;
                }

                if (paths_self.game.spaces[spacekey].units.length > 0) {
                  for (let z = 0; z < paths_self.game.spaces[spacekey].units.length; z++) {
                    let u = paths_self.game.spaces[spacekey].units[z];

                    if (faction != paths_self.returnPowerOfUnit(u)) {
                      return 0;
                    }

                    if (u.ckey == unit.ckey) {
                      return 1;
                    }
                  }
                }

                if (spacekey == 'salonika') {
                  if (
                    unit.ckey == 'SB' &&
                    (paths_self.game.state.events.salonika ||
                      paths_self.game.state.events.greek_neutral_entry)
                  ) {
                    return 1;
                  }
                }

                if (unit.ckey == 'RU') {
                  if (unit.army) {
                    if (this.game.spaces[spacekey].country != 'russia') {
                      return 0;
                    }
                  }
                  if (this.game.state.has_russian_corps_deployed_into_ne == 1) {
                    return 0;
                  } else {
                    if (this.game.spaces['sinai'].control != 'allies') {
                      if (this.game.spaces[spacekey].country == 'egypt') {
                        return 0;
                      }
                      if (this.game.spaces[spacekey].country == 'libya') {
                        return 0;
                      }
                    }
                  }
                }

                if (unit.ckey == 'BE') {
                  if (spacekey == 'brussels') {
                    return 1;
                  }
                  if (spacekey == 'ostend') {
                    return 1;
                  }
                  if (spacekey == 'antwerp') {
                    if (paths_self.checkSupplyStatus(unit.ckey.toLowerCase(), spacekey) == 1) {
                      return 1;
                    }
                  }
                  if (spacekey == 'calais') {
                    if (
                      paths_self.game.spaces['brussels'].control == 'central' &&
                      paths_self.game.spaces['ostend'].control == 'central' &&
                      (paths_self.game.spaces['antwerp'].control == 'central' ||
                        !paths_self.checkSupplyStatus(unit.ckey.toLowerCase(), 'antwerp'))
                    ) {
                      return 1;
                    }
                  }
                }

                if (paths_self.checkSupplyStatus(unit.ckey.toLowerCase(), spacekey) == 1) {
                  if (paths_self.game.spaces[spacekey].units.length < 3) {
                    if (paths_self.isSpaceOnNearEastMap(spacekey)) {
                      if (!paths_self.canPlayerDeployUnitIntoNearEast(faction, unit)) {
                        return 1;
                      }
                      return 0;
                    }

                    return 1;
                  }
                }
              }
              return 0;
            },
            (spacekey) => {
              if (spacekey === 'mainmenu') {
                this.render();
                return 1;
              }

              if (paths_self.isSpaceOnNearEastMap(spacekey)) {
                paths_self.game.state.does_movement_end_outside_near_east = 0;
                paths_self.game.state.does_movement_end_inside_near_east = 1;
                paths_self.trackDeploymentIntoNearEast(faction, unit);
              } else {
                paths_self.game.state.does_movement_end_outside_near_east = 1;
                paths_self.game.state.does_movement_end_inside_near_east = 0;
                paths_self.trackDeploymentIntoNearEast(faction, unit);
              }

              paths_self.game.status = 'moving...';
              paths_self.hud.updateStatus(paths_self.game.status);
              paths_self.hud.updateMenu([]);
              paths_self.hud.updateCards([]);
              paths_self.moveUnit(eu[z].key, eu[z].idx, spacekey);
              paths_self.prependMove(
                `NOTIFY\t${paths_self.returnFactionName(faction)} deploys ${unit.name} to ${paths_self.returnSpaceNameForLog(eu[z].key)}`
              );
              paths_self.prependMove(
                `move\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${spacekey}\t${paths_self.game.player}`
              );
              paths_self.displaySpace(eu[z].key);
              paths_self.displaySpace(spacekey);
              paths_self.playerSpendReplacementPoints(paths_self.returnFactionOfPlayer());
            },
            null,
            true,
            [{ key: 'mainmenu', value: 'back to menu' }]
          );
        }
      };
    });

    try {
      let submenu = document.querySelector('.replacements-overlay .submenu');
      if (submenu) {
        submenu.classList.add('is-open');
      }
      this.markSelectedAction(id);
    } catch (err) {}
  }
}

module.exports = ReplacementsOverlay;
