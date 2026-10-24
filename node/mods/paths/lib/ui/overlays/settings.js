const SettingsTemplate = require('./settings.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class SettingsOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false, true, false);
    this.show_combat_overlays = false;
  }

  hide() {
    this.overlay.hide();
  }

  render() {
    this.overlay.showClosable(SettingsTemplate());

    let root = document.querySelector('.settings-overlay');
    if (!root) {
      return;
    }

    let movement = root.querySelector('[data-setting="mouseover_for_movement"]');
    let combat = root.querySelector('[data-setting="show_combat_overlays"]');
    if (movement) {
      movement.checked = this.mod.movementMouseoverEnabled();
    }
    if (combat) {
      combat.checked = this.show_combat_overlays;
    }

    root.querySelectorAll('input[data-setting]').forEach((input) => {
      input.onchange = (e) => {
        let setting = e.currentTarget.dataset.setting;
        if (setting === 'mouseover_for_movement') {
          this.mod.saveGamePreference('pathsofglory_mouseover_for_movement', e.currentTarget.checked ? 1 : 0);
          if (!e.currentTarget.checked) {
            this.mod.removeMovementCues();
          }
        }
        if (setting === 'show_combat_overlays') {
          this.show_combat_overlays = e.currentTarget.checked;
        }
      };
    });
  }
}

module.exports = SettingsOverlay;
