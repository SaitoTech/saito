const SaitoOverlay = require('../saito-overlay/saito-overlay');
const ScreenSaverTemplate = require('./saito-screensaver.template');
const UIModTemplate = require('./../../../templates/uimodtemplate');

class SaitoScreenSaver extends UIModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'ScreenSaver';

    this.time_online = null;
    this.device = null;
    this.overlay = new SaitoOverlay(this.app, this, false);
  }

  async initialize(app) {
    await super.initialize(app);
    //
    // We want to store a device ID outside of the wallet, so we can know where we are
    //
    this.device = localStorage.getItem('saito-device') || null;
    if (!this.device) {
      this.device = navigator.userAgent + Math.floor(10000 * Math.random());
      this.addDevice(this.device);
      localStorage.setItem('saito-device', this.device);
    }
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (service.service == 'relay') {
      if (!this.time_online) {
        console.log('+++++++++++++++++++++++\nSending online message');
        this.time_online = Date.now();
        this.app.browser.hibernate = false;
        this.app.connection.emit('relay-send-message', {
          recipient: this.publicKey,
          request: 'screensaver',
          data: { ts: this.time_online, device: this.device }
        });
        this.app.browser.hibernate = true;
      }
    }
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx.isTo(this.publicKey)) {
      let txmsg = tx.returnMessage();
      console.log('+++++++++++++++++++++', txmsg);
      if (txmsg.request == 'screensaver') {
        if (txmsg.data.device !== this.device) {
          this.app.browser.hibernate = true;
          this.render(txmsg.data);
        } else {
          this.app.browser.hibernate = false;
        }
      }
    }
  }

  render(details) {
    this.overlay.render(ScreenSaverTemplate(details));
    this.overlay.blockClose();
    this.attachEvents();
  }

  attachEvents() {
    if (document.getElementById('wake-up-button')) {
      document.getElementById('wake-up-button').onclick = (e) => {
        this.app.browser.hibernate = false;
        this.time_online = Date.now();
        this.app.connection.emit('relay-send-message', {
          recipient: this.publicKey,
          request: 'screensaver',
          data: { ts: this.time_online, device: this.device }
        });
        //
        // Stay in hibernation mode until confirmed
        //
        this.app.browser.hibernate = true;
      };
    }
  }

  addDevice(device) {
    if (!this.app.options.devices) {
      this.app.options.devices = [];
    }

    for (let d of this.app.options.devices) {
      if (d == device) {
        return;
      }
    }

    this.app.options.devices.push(device);

    this.app.storage.saveOptions();
  }
}

module.exports = SaitoScreenSaver;
