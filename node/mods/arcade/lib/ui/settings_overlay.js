/**
 * Arcade Settings overlay — short informational panel with Store / Wiki links.
 */
const SettingsOverlayTemplate = require('./settings_overlay.template');
const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');

class SettingsOverlay {
  constructor(app, mod = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
  }

  render() {
    this.overlay.show(SettingsOverlayTemplate());
    this.attachEvents();
  }

  attachEvents() {
    let root = document.querySelector('.arcade-settings');
    if (!root) {
      return;
    }

    let store = root.querySelector('[data-action="store"]');
    if (store) {
      store.onclick = (e) => {
        e.preventDefault();
        if (this.app.modules.returnModule('Store')) {
          this.overlay.remove();
          navigateWindow('/store', 200);
        } else {
          siteMessage('The Saito Store is not available on this node.', 3000);
        }
      };
    }

    let wiki = root.querySelector('[data-action="wiki"]');
    if (wiki) {
      wiki.onclick = (e) => {
        e.preventDefault();
        window.open('https://wiki.saito.io', '_blank', 'noopener,noreferrer');
      };
    }
  }
}

module.exports = SettingsOverlay;
