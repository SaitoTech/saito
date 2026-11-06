const HudLayer = require('../hud-layer');
const MovementOverlayTemplate = require('./movement.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class MovementOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod, false);
    this.fade_out_available_units = false;
    this.mobj = null;
    this.selectUnitsInterface = null;
    this.selectDestinationInterface = null;
  }

  hide() {
    this.overlay.hide();
    return;
  }

  renderForceOpen(
    mobj,
    units_to_move,
    selectUnitsInterface = null,
    selectDestinationInterface = null
  ) {
    this.render(mobj, units_to_move, selectUnitsInterface, selectDestinationInterface, true);
  }

  pullHudOverOverlay() {
    HudLayer.pullHudOverOverlay.call(this);
  }

  pushHudUnderOverlay() {
    HudLayer.pushHudUnderOverlay.call(this);
  }

  render(
    mobj,
    units_to_move = null,
    selectUnitsInterface = null,
    selectDestinationInterface = null,
    force_open = false
  ) {
    if (force_open == false) {
      this.overlay.closebox = false;
      this.overlay.clickToClose = false;
      this.overlay.clickBackdropToClose = false;
    } else {
      this.overlay.closebox = true;
      this.overlay.clickToClose = false;
      this.overlay.clickBackdropToClose = true;
    }

    let his_self = this.mod;
    let space = mobj.space;
    this.mobj = mobj;
    this.selectUnitsInterface = selectUnitsInterface;
    this.selectDestinationInterface = selectDestinationInterface;
    let faction = mobj.faction;
    let source = mobj.source;
    let destination = mobj.destination;
    let max_formation_size = this.mod.returnMaxFormationSize(units_to_move, faction, source);
    let units = space.units[faction];

    let from = this.mod.game.spaces[source].name;
    let to = '';
    if (destination === '') {
      destination = '?';
    } else {
      to = this.mod.game.spaces[destination].name;
    }
    if (!mobj.unmoved_units) {
      mobj.unmoved_units = [];
    }
    if (!mobj.moved_units) {
      mobj.moved_units = [];
    }

    //
    // create list of figures in each space
    //
    let moved_units = mobj.moved_units;
    let unmoved_units = mobj.unmoved_units;
    let destination_units = [];

    //
    // reset on-chit-ui if no moved units
    //
    if (moved_units.length == 0) {
      this.fade_out_available_units = false;
      document.querySelectorAll('.army_tile').forEach((el) => {
        if (el.classList.contains('nonopaque')) {
          el.classList.remove('nonopaque');
          el.classList.add('opaque');
        }
      });
    }

    let s = destination;
    try {
      if (this.mod.game.spaces[s]) {
        s = this.mod.game.spaces[s];
      }
    } catch (err) {}
    for (let key in s.units) {
      if (his_self.returnPlayerCommandingFaction(key) == faction) {
        for (let i = 0; i < s.units[key].length; i++) {
          if (s.units[key][i].land_or_sea === 'land' || s.units[key][i].land_or_sea === 'both') {
            destination_units.push({
              faction: key,
              idx: i,
              type: s.units[key][i].type
            });
          }
        }
      }
    }

    let obj = {
      faction: faction,
      moved_units: moved_units,
      unmoved_units: unmoved_units,
      destination_units: destination_units,
      space: space,
      from: from,
      to: to,
      max_formation_size: max_formation_size,
      units_to_move: units_to_move,
      selectUnitsInterface: selectUnitsInterface,
      selectDestinationInterface: selectDestinationInterface
    };

    this.mod.available_units_overlay.hide();
    this.overlay.show(MovementOverlayTemplate(obj, this.mod));
    this.mod.available_units_overlay.renderMove(mobj, faction, space.key);
    if (this.fade_out_available_units) {
      this.mod.available_units_overlay.fadeOut();
    }

    this.pushHudUnderOverlay();

    this.attachEvents(obj);
  }

  attachEvents(obj) {
    let his_self = this.mod;
    let units_to_move = obj.units_to_move || [];
    let space = obj.space;

    document.querySelectorAll('.movement-overlay .movement-unit.option').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();

        let parts = e.currentTarget.id.split('-');
        let faction = parts[0];
        let idx = parseInt(parts[1], 10);
        if (!faction || Number.isNaN(idx)) {
          return;
        }

        let selected = -1;
        for (let z = 0; z < units_to_move.length; z++) {
          if (units_to_move[z].faction === faction && parseInt(units_to_move[z].idx, 10) === idx) {
            selected = z;
            break;
          }
        }

        if (this.factionIsOverCapacity(faction)) {
          alert(
            'This faction is over-capacity (no more free 1-UNIT tokens). Please move by clicking on the circular tokens you wish to move instead of shifting forces in 1-UNIT increments'
          );
          return;
        }

        if (selected >= 0) {
          units_to_move.splice(selected, 1);
          if (units_to_move.length == 0) {
            his_self.available_units_overlay.faded_out = false;
            this.fade_out_available_units = false;
          }
        } else {
          let unitno = 0;
          for (let i = 0; i < units_to_move.length; i++) {
            let selected_unit =
              space.units[units_to_move[i].faction] &&
              space.units[units_to_move[i].faction][units_to_move[i].idx];
            if (selected_unit && selected_unit.command_value == 0) {
              unitno++;
            }
          }
          let max_formation_size = obj.max_formation_size;
          if (unitno >= max_formation_size) {
            max_formation_size = his_self.returnMaxFormationSize(
              units_to_move,
              obj.faction,
              space.key
            );
            if (unitno >= max_formation_size) {
              alert('Maximum Formation Size: ' + max_formation_size);
              return;
            }
          }

          let entry = this.findColumnUnit(obj, faction, idx);
          let unit = space.units[faction] && space.units[faction][idx];
          units_to_move.push(
            entry || {
              faction: faction,
              idx: idx,
              type: unit ? unit.type : '',
              spacekey: space.key
            }
          );
        }

        if (typeof this.selectUnitsInterface === 'function') {
          this.selectUnitsInterface(
            his_self,
            units_to_move,
            this.selectUnitsInterface,
            this.selectDestinationInterface
          );
        }
      };
    });

    let submit = document.querySelector('.movement-overlay .movement-submit-button');
    if (submit) {
      submit.onclick = (e) => {
        e.stopPropagation();
        this.hide();
        if (typeof this.selectDestinationInterface === 'function') {
          this.selectDestinationInterface(his_self, units_to_move);
        }
      };
    }
  }

  factionIsOverCapacity(faction) {
    try {
      let on_board = this.mod.returnOnBoardUnits(faction);
      return !!(on_board && on_board.overcapacity == 1);
    } catch (err) {
      return false;
    }
  }

  findColumnUnit(obj, faction, idx) {
    let lists = [obj.unmoved_units || [], obj.moved_units || []];
    for (let i = 0; i < lists.length; i++) {
      for (let z = 0; z < lists[i].length; z++) {
        if (lists[i][z].faction === faction && parseInt(lists[i][z].idx, 10) === idx) {
          return JSON.parse(JSON.stringify(lists[i][z]));
        }
      }
    }
    return null;
  }
}

module.exports = MovementOverlay;
