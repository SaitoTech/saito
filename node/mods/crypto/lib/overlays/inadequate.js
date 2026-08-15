const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const CryptoInadequateTemplate = require('./inadequate.template');

class CryptoInadequate {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
  }

  render() {
    this.overlay.show(CryptoInadequateTemplate(this.app, this.mod));
    document.querySelector('#exit_staking').onclick = (e) => {
      this.overlay.hide();
    };
  }
}

module.exports = CryptoInadequate;
