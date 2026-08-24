const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SettingsTemplate = require('./settings.template');

class SettingsOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
  }

  isProfileLinked() {
    const url = String(this.mod.returnStorefrontUrl?.(this.mod.publicKey) || '').trim();
    if (!url) {
      return false;
    }
    return this.mod.returnProfileStoreUrl?.() === url;
  }

  render() {
    this.overlay.show(SettingsTemplate({ profileLinkChecked: this.isProfileLinked() }));
    this.attachEvents();
  }

  attachEvents() {
    const toggle = document.querySelector('.store-settings [data-action="toggle-profile-link"]');
    if (!toggle) {
      return;
    }

    toggle.addEventListener('change', async () => {
      const url = this.mod.returnStorefrontUrl?.(this.mod.publicKey) || '';
      try {
        if (toggle.checked) {
          if (!url) {
            toggle.checked = false;
            return;
          }
          await this.mod.updateProfile?.(url);
          this.app.connection.emit('store-profile-link-updated');
        } else {
          await this.mod.updateProfile?.('');
        }
      } catch (err) {
        console.warn('Store: profile link toggle failed', err?.message || err);
        toggle.checked = !toggle.checked;
      }
    });
  }
}

module.exports = SettingsOverlay;
