const ManualMovementTemplate = require('./manual-movement.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ManualMovementOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod, false);
    this.overlay.clickBackdropToClose = false;
    this.destination = '';
    this.destination_name = '';
    this.groups = [];
    this.selected = {};
    this.cargo = {};
    this.note = '';
    this.infantry_cost = 1;
    this.fighter_cost = 1;
  }

  render(destination) {
    this.destination = destination;
    this.selected = {};
    this.cargo = {};
    this.note = '';
    this.gather();
    this.paint();
  }

  gather() {
    let mod = this.mod;
    let player = mod.game.player;
    let info = mod.game.state.players_info[player - 1];
    let ship_move_bonus = info.ship_move_bonus + info.temporary_ship_move_bonus;
    let fleet_move_bonus = info.fleet_move_bonus + info.temporary_fleet_move_bonus;
    let max_hops = 2 + ship_move_bonus + fleet_move_bonus;
    let reach = mod.returnSectorsWithinHopDistance(this.destination, max_hops, player);
    let distance = reach.distance.slice();

    for (let i = 0; i < distance.length; i++) {
      if (ship_move_bonus > 0) {
        distance[i]--;
      }
      if (fleet_move_bonus > 0) {
        distance[i]--;
      }
    }

    let found = mod.returnShipsMovableToDestinationFromSectors(
      this.destination,
      reach.sectors,
      distance,
      reach.hazards,
      reach.hoppable
    );

    let dest = mod.returnSectorAndPlanets(this.destination);
    this.destination_name = dest && dest.s && dest.s.name ? dest.s.name : this.destination;

    let infantry = mod.returnUnit('infantry', player);
    let fighter = mod.returnUnit('fighter', player);
    this.infantry_cost = infantry && infantry.capacity_required > 0 ? infantry.capacity_required : 1;
    this.fighter_cost = fighter && fighter.capacity_required > 0 ? fighter.capacity_required : 1;

    this.groups = [];
    for (let g = 0; g < found.length; g++) {
      let entry = found[g];
      let sys = mod.returnSectorAndPlanets(entry.sector);
      if (!sys || !sys.s) {
        continue;
      }
      let ships = [];
      for (let s = 0; s < entry.ships.length; s++) {
        let ship = entry.ships[s];
        if (!ship || !ship.type || ship.destroyed == 1) {
          continue;
        }
        if (ship.type === 'fighter' && ship.move == 1) {
          continue;
        }
        let aboard_infantry = 0;
        let aboard_fighters = 0;
        let storage = ship.storage || [];
        for (let i = 0; i < storage.length; i++) {
          if (storage[i].type === 'infantry') {
            aboard_infantry++;
          }
          if (storage[i].type === 'fighter') {
            aboard_fighters++;
          }
        }
        let aboard = '';
        if (aboard_infantry || aboard_fighters) {
          let parts = [];
          if (aboard_infantry) {
            parts.push(aboard_infantry + ' infantry aboard');
          }
          if (aboard_fighters) {
            parts.push(aboard_fighters + ' fighters aboard');
          }
          aboard = parts.join(', ');
        }
        ships.push({
          ship: ship,
          name: ship.name || ship.type,
          move: ship.move,
          capacity: mod.returnRemainingCapacity(ship),
          can_carry: (ship.capacity || 0) > 0,
          hazard: entry.hazards[s] || '',
          aboard: aboard
        });
      }

      let planets = [];
      for (let p = 0; p < sys.p.length; p++) {
        let n = 0;
        let units = sys.p[p].units[player - 1] || [];
        for (let i = 0; i < units.length; i++) {
          if (units[i].type === 'infantry') {
            n++;
          }
        }
        planets.push({ name: sys.p[p].name, infantry: n });
      }

      let fighters = 0;
      let space = sys.s.units[player - 1] || [];
      for (let i = 0; i < space.length; i++) {
        if (space[i].type === 'fighter' && space[i].destroyed != 1) {
          fighters++;
        }
      }

      if (ships.length || planets.length) {
        this.groups.push({
          sector: entry.sector,
          name: sys.s.name,
          ships: ships,
          planets: planets,
          fighters: fighters
        });
      }
    }
  }

  capacityLeft(key) {
    let parts = key.split('_');
    let ship = this.groups[parts[0]].ships[parts[1]];
    let cargo = this.cargo[key] || { infantry: {}, fighters: 0 };
    let used = (cargo.fighters || 0) * this.fighter_cost;
    let infantry = cargo.infantry || {};
    for (let planet in infantry) {
      used += infantry[planet] * this.infantry_cost;
    }
    return Math.max(0, ship.capacity - used);
  }

  infantryLeft(group_index, planet_index) {
    let group = this.groups[group_index];
    let used = 0;
    for (let s = 0; s < group.ships.length; s++) {
      let key = group_index + '_' + s;
      let cargo = this.cargo[key];
      if (cargo && cargo.infantry && cargo.infantry[planet_index]) {
        used += cargo.infantry[planet_index];
      }
    }
    return Math.max(0, group.planets[planet_index].infantry - used);
  }

  fightersLeft(group_index) {
    let group = this.groups[group_index];
    let used = 0;
    let flying = 0;
    for (let s = 0; s < group.ships.length; s++) {
      let key = group_index + '_' + s;
      if (group.ships[s].ship.type === 'fighter' && this.selected[key]) {
        flying++;
      }
      let cargo = this.cargo[key];
      if (cargo && cargo.fighters) {
        used += cargo.fighters;
      }
    }
    return Math.max(0, group.fighters - flying - used);
  }

  summary() {
    let ships = 0;
    let infantry = 0;
    let fighters = 0;
    for (let key in this.selected) {
      if (!this.selected[key]) {
        continue;
      }
      ships++;
      let cargo = this.cargo[key];
      if (!cargo) {
        continue;
      }
      fighters += cargo.fighters || 0;
      let list = cargo.infantry || {};
      for (let planet in list) {
        infantry += list[planet];
      }
    }
    let text = ships + (ships === 1 ? ' ship' : ' ships');
    text += ' · ' + infantry + ' infantry';
    text += ' · ' + fighters + (fighters === 1 ? ' fighter' : ' fighters');
    return text;
  }

  paint() {
    let body = document.querySelector('.manual-movement-overlay .mm-body');
    let scroll = body ? body.scrollTop : 0;
    this.overlay.show(
      ManualMovementTemplate({
        destination_name: this.destination_name,
        groups: this.groups,
        selected: this.selected,
        cargo: this.cargo,
        note: this.note,
        summary: this.summary(),
        capacityLeft: (key) => this.capacityLeft(key),
        infantryLeft: (group, planet) => this.infantryLeft(group, planet),
        fightersLeft: (group) => this.fightersLeft(group)
      })
    );
    this.overlay.setBackgroundColor('#000D');
    let next = document.querySelector('.manual-movement-overlay .mm-body');
    if (next) {
      next.scrollTop = scroll;
    }
    this.attachEvents();
  }

  attachEvents() {
    let overlay_self = this;
    document.querySelectorAll('.manual-movement-overlay .mm-ship-toggle').forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        let key = el.getAttribute('data-key');
        overlay_self.selected[key] = !overlay_self.selected[key];
        if (!overlay_self.selected[key]) {
          delete overlay_self.cargo[key];
        } else if (!overlay_self.cargo[key]) {
          overlay_self.cargo[key] = { infantry: {}, fighters: 0 };
        }
        overlay_self.note = '';
        overlay_self.paint();
      };
    });

    document.querySelectorAll('.manual-movement-overlay .mm-step').forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay_self.step(
          el.getAttribute('data-act'),
          el.getAttribute('data-kind'),
          el.getAttribute('data-key'),
          el.getAttribute('data-planet')
        );
      };
    });

    let cancel = document.querySelector('.manual-movement-overlay .mm-cancel');
    if (cancel) {
      cancel.onclick = (e) => {
        e.preventDefault();
        overlay_self.overlay.hide();
        overlay_self.mod.playerMoveShipsMenu(overlay_self.destination);
      };
    }

    let confirm = document.querySelector('.manual-movement-overlay .mm-confirm');
    if (confirm) {
      confirm.onclick = (e) => {
        e.preventDefault();
        overlay_self.submit();
      };
    }
  }

  step(act, kind, key, planet) {
    if (!this.selected[key]) {
      return;
    }
    if (!this.cargo[key]) {
      this.cargo[key] = { infantry: {}, fighters: 0 };
    }
    let cargo = this.cargo[key];
    let parts = key.split('_');
    let group_index = parseInt(parts[0], 10);
    if (kind === 'infantry') {
      let planet_index = parseInt(planet, 10);
      let current = cargo.infantry[planet_index] || 0;
      if (act === 'plus') {
        if (this.infantryLeft(group_index, planet_index) <= 0) {
          return;
        }
        if (this.capacityLeft(key) < this.infantry_cost) {
          this.note = 'That ship has no capacity left.';
          this.paint();
          return;
        }
        cargo.infantry[planet_index] = current + 1;
      } else if (current > 0) {
        cargo.infantry[planet_index] = current - 1;
      }
    }
    if (kind === 'fighter') {
      let current = cargo.fighters || 0;
      if (act === 'plus') {
        if (this.fightersLeft(group_index) <= 0) {
          return;
        }
        if (this.capacityLeft(key) < this.fighter_cost) {
          this.note = 'That ship has no capacity left.';
          this.paint();
          return;
        }
        cargo.fighters = current + 1;
      } else if (current > 0) {
        cargo.fighters = current - 1;
      }
    }
    this.note = '';
    this.paint();
  }

  selectedShips() {
    let list = [];
    for (let g = 0; g < this.groups.length; g++) {
      for (let s = 0; s < this.groups[g].ships.length; s++) {
        let key = g + '_' + s;
        if (this.selected[key]) {
          list.push({
            key: key,
            group: this.groups[g],
            ship: this.groups[g].ships[s]
          });
        }
      }
    }
    return list;
  }

  submit() {
    let chosen = this.selectedShips();
    if (!chosen.length) {
      this.note = 'Select at least one ship.';
      this.paint();
      return;
    }

    let mod = this.mod;
    let player = mod.game.player;
    let loads = [];

    for (let i = 0; i < chosen.length; i++) {
      let item = chosen[i];
      let sys = mod.returnSectorAndPlanets(item.group.sector);
      let units = sys.s.units[player - 1];
      let cargo = this.cargo[item.key] || { infantry: {}, fighters: 0 };
      let infantry = cargo.infantry || {};

      for (let planet in infantry) {
        for (let n = 0; n < infantry[planet]; n++) {
          let idx = units.indexOf(item.ship.ship);
          let unitjson = mod.unloadUnitFromPlanet(player, item.group.sector, planet, 'infantry');
          let shipjson = JSON.stringify(units[idx]);
          mod.loadUnitByJSONOntoShip(player, item.group.sector, idx, unitjson);
          loads.push({
            sector: item.group.sector,
            source: 'planet',
            source_idx: planet,
            unitjson: unitjson,
            shipjson: shipjson
          });
        }
      }

      for (let n = 0; n < (cargo.fighters || 0); n++) {
        let fighter = null;
        for (let u = 0; u < units.length; u++) {
          if (units[u].type !== 'fighter' || units[u].destroyed == 1) {
            continue;
          }
          let flying = false;
          for (let c = 0; c < chosen.length; c++) {
            if (chosen[c].ship.ship === units[u]) {
              flying = true;
            }
          }
          if (!flying) {
            fighter = units[u];
            break;
          }
        }
        if (!fighter) {
          break;
        }
        let unitjson = JSON.stringify(fighter);
        mod.removeSpaceUnitByJSON(player, item.group.sector, unitjson);
        let idx = units.indexOf(item.ship.ship);
        let shipjson = JSON.stringify(units[idx]);
        mod.loadUnitByJSONOntoShip(player, item.group.sector, idx, unitjson);
        loads.push({
          sector: item.group.sector,
          source: 'ship',
          source_idx: '',
          unitjson: unitjson,
          shipjson: shipjson
        });
      }
    }

    mod.addMove('resolve\tplay');
    mod.addMove('space_invasion\t' + player + '\t' + this.destination);
    mod.addMove('check_fleet_supply\t' + player + '\t' + this.destination);

    for (let i = 0; i < chosen.length; i++) {
      let item = chosen[i];
      mod.addMove('check_fleet_supply\t' + player + '\t' + item.group.sector);
      mod.addMove(
        'move\t' +
          player +
          '\t' +
          1 +
          '\t' +
          item.group.sector +
          '\t' +
          this.destination +
          '\t' +
          JSON.stringify(item.ship.ship) +
          '\t' +
          item.ship.hazard
      );
    }

    for (let y = loads.length - 1; y >= 0; y--) {
      mod.addMove(
        'load\t' +
          player +
          '\t' +
          0 +
          '\t' +
          loads[y].sector +
          '\t' +
          loads[y].source +
          '\t' +
          loads[y].source_idx +
          '\t' +
          loads[y].unitjson +
          '\t' +
          loads[y].shipjson
      );
    }

    this.overlay.hide();
    mod.endTurn();
  }
}

module.exports = ManualMovementOverlay;
