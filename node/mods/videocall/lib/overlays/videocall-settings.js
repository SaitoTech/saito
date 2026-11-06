const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');
const VideoCallSettingsTemplate = require('./videocall-settings.template');

class VideoCallSettings {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.saitoOverlay = new SaitoOverlay(app, mod);
  }

  render() {
    this.saitoOverlay.show(VideoCallSettingsTemplate(this.mod, this.app));
    this.mod.loadSettings('.videocall-settings-content');

    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector('.videocall-settings-modal');

    Array.from(root.querySelectorAll('.videocall-option-input')).forEach((option) => {
      option.onchange = (e) => {
        let choice = e.currentTarget.getAttribute('value');
        this.app.connection.emit('stun-switch-view', choice);

        this.app.options.stun.settings.layout = choice;
        this.app.storage.saveOptions();
      };
    });
  }
}

module.exports = VideoCallSettings;
