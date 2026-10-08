const HudLayer = require('../hud-layer');
const FortificationOverlayTemplate = require('./fortification.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class FortificationOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod, false);
  }

  hide() {
    this.overlay.hide();
    return;
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
    finishAndFortify = null,
    unfortification_mode = 0
  ) {
    let his_self = this.mod;
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

    this.units_to_move = units_to_move || [];
    this.selectUnitsInterface = selectUnitsInterface;
    this.finishAndFortify = finishAndFortify;

    this.overlay.show(FortificationOverlayTemplate(mobj, his_self));

    this.pushHudUnderOverlay();

    if (unfortification_mode == 1) {
      document.querySelector('.fortification-from').innerHTML = 'Under Seige';
      document.querySelector('.fortification-to').innerHTML = 'Field Battle';
      document.querySelector('.fortification-submit-button').innerHTML = 'Confirm and Join Battle';
    }

    this.attachEvents(mobj);
  }

  attachEvents(mobj) {
    let his_self = this.mod;
    let units_to_move = this.units_to_move || [];
    let space = his_self.game.spaces[mobj.spacekey];

    document.querySelectorAll('.fortification-overlay .fortification-unit.option').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();

        let parts = e.currentTarget.id.split('-');
        let faction = parts[0];
        let idx = parseInt(parts[1], 10);
        if (!faction || Number.isNaN(idx) || !space || !space.units[faction]) {
          return;
        }

        let selected = -1;
        for (let z = 0; z < units_to_move.length; z++) {
          if (units_to_move[z].faction === faction && parseInt(units_to_move[z].idx, 10) === idx) {
            selected = z;
            break;
          }
        }

        if (selected >= 0) {
          units_to_move.splice(selected, 1);
        } else {
          let unitno = 0;
          for (let i = 0; i < units_to_move.length; i++) {
            let selected_unit =
              space.units[units_to_move[i].faction] &&
              space.units[units_to_move[i].faction][units_to_move[i].idx];
            if (selected_unit && selected_unit.army_leader == false) {
              unitno++;
            }
          }
          if (unitno >= 4) {
            alert('Max 4 Units Permitted in Fortification');
            return;
          }
          units_to_move.push({
            faction: faction,
            idx: idx,
            type: space.units[faction][idx].type
          });
        }

        if (typeof this.selectUnitsInterface === 'function') {
          this.selectUnitsInterface(
            his_self,
            units_to_move,
            this.selectUnitsInterface,
            this.finishAndFortify
          );
        }
      };
    });

    let submit = document.querySelector('.fortification-overlay .fortification-submit-button');
    if (submit) {
      submit.onclick = (e) => {
        e.stopPropagation();
        this.hide();
        if (typeof this.finishAndFortify === 'function') {
          this.finishAndFortify(
            his_self,
            units_to_move,
            this.selectUnitsInterface,
            this.finishAndFortify
          );
        }
      };
    }
  }
}

module.exports = FortificationOverlay;
