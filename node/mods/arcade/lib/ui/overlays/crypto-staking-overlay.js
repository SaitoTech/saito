const CryptoStakingOverlayTemplate = require('./crypto-staking.overlay.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class CryptoStakingOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
  }

  render() {
    this.overlay.show(CryptoStakingOverlayTemplate());
    this.attachEvents();
  }

  attachEvents() {
    let get_saito_btn = document.getElementById('crypto-staking-get-saito');
    if (get_saito_btn) {
      get_saito_btn.onclick = () => {
        this.overlay.close();
        this.app.connection.emit('saito-purchase-launch');
      };
    }
  }
}

module.exports = CryptoStakingOverlay;
