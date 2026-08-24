const ControlsTemplate = require('./controls.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ControlsOverlay {
  constructor(app, mod = null, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.refresh_timer = null;
  }

  currentMappings() {
    try {
      if (typeof myApp !== 'undefined' && myApp?.rivetsData?.inputController?.KeyMappings) {
        return JSON.parse(JSON.stringify(myApp.rivetsData.inputController.KeyMappings));
      }
    } catch (err) {}
    return {};
  }

  prepareEmulatorRemap() {
    if (typeof myApp === 'undefined' || !myApp.rivetsData) {
      return;
    }

    if (!myApp.rivetsData.inputLoopStarted) {
      myApp.rivetsData.inputLoopStarted = true;
      myApp.rivetsData.inputController.setupGamePad();
      setTimeout(() => {
        if (typeof myClass !== 'undefined') {
          myClass.inputLoop();
        }
      }, 100);
    }

    if (myApp.rivetsData.inputController.Gamepad_Process_Axis) {
      myApp.rivetsData.chkUseJoypad = true;
    }
    myApp.rivetsData.remappings = JSON.parse(
      JSON.stringify(myApp.rivetsData.inputController.KeyMappings)
    );
    myApp.rivetsData.remapWait = false;
  }

  render() {
    this.prepareEmulatorRemap();
    this.overlay.show(ControlsTemplate(this.app, this.mod, this.currentMappings()));
    this.attachEvents();
    this.startRefreshLoop();
  }

  refreshBindings() {
    let root = document.querySelector('.nwasm-controls');
    if (!root || typeof myApp === 'undefined') {
      return;
    }

    let maps = myApp.rivetsData?.remappings || this.currentMappings();
    root.querySelectorAll('.binding[data-map]').forEach((el) => {
      let key = el.getAttribute('data-map');
      if (!key) {
        return;
      }
      el.textContent = maps[key] || '';
    });

    let wait = root.querySelector('.wait');
    if (wait) {
      wait.hidden = !myApp.rivetsData?.remapWait;
    }
  }

  startRefreshLoop() {
    this.stopRefreshLoop();
    this.refresh_timer = setInterval(() => {
      this.refreshBindings();
    }, 200);
  }

  stopRefreshLoop() {
    if (this.refresh_timer) {
      clearInterval(this.refresh_timer);
      this.refresh_timer = null;
    }
  }

  attachEvents() {
    let root = document.querySelector('.nwasm-controls');
    if (!root) {
      return;
    }

    root.onclick = (e) => {
      let btn = e.target.closest('[data-action]');
      if (!btn || typeof myApp === 'undefined') {
        return;
      }

      let action = btn.getAttribute('data-action');
      let id = parseInt(btn.getAttribute('data-id') || '0');

      if (action === 'remap-key') {
        myApp.btnRemapKey(id);
        this.refreshBindings();
        return;
      }
      if (action === 'remap-joy') {
        myApp.btnRemapJoy(id);
        this.refreshBindings();
        return;
      }
      if (action === 'defaults') {
        myApp.restoreDefaultKeymappings();
        this.refreshBindings();
        return;
      }
      if (action === 'save') {
        // Avoid bootstrap modal hide; persist mappings directly.
        if (myApp.rivetsData.chkUseJoypad) {
          myApp.rivetsData.inputController.Gamepad_Process_Axis = true;
        } else {
          myApp.rivetsData.inputController.Gamepad_Process_Axis = false;
        }
        myApp.rivetsData.inputController.KeyMappings = JSON.parse(
          JSON.stringify(myApp.rivetsData.remappings)
        );
        myApp.rivetsData.inputController.setGamePadButtons();
        localStorage.setItem(
          'n64wasm_mappings_v3',
          JSON.stringify(myApp.rivetsData.remappings)
        );
        this.stopRefreshLoop();
        this.overlay.hide();
      }
    };
  }
}

module.exports = ControlsOverlay;
