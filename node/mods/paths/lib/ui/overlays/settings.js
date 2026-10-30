const SettingsTemplate = require('./settings.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class SettingsOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false, true, false);
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
    let popups = root.querySelector('[data-setting="remove_card_popups"]');
    let combat_overlays = root.querySelector('[data-setting="use_combat_overlays"]');
    if (movement) {
      movement.checked = this.mod.movementMouseoverEnabled();
    }
    if (popups) {
      popups.checked = this.mod.cardPopupsRemoved();
    }
    if (combat_overlays) {
      combat_overlays.checked = this.mod.loss_overlay
        ? this.mod.loss_overlay.overlayEnabled()
        : true;
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
        if (setting === 'remove_card_popups') {
          this.mod.saveGamePreference('pathsofglory_remove_card_popups', e.currentTarget.checked ? 1 : 0);
          this.mod.applyCardPopupPreference();
        }
        if (setting === 'use_combat_overlays' && this.mod.loss_overlay) {
          this.mod.loss_overlay.setOverlayEnabled(!!e.currentTarget.checked);
        }
      };
    });
  }
}

module.exports = SettingsOverlay;
