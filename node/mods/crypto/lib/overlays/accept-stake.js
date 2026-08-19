const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const AcceptStakeTemplate = require('./accept-stake.template');

class AcceptStake {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.accept_callback = null;
    this.reject_callback = null;
  }

  async render(obj) {
    if (obj?.accept_callback) {
      this.accept_callback = obj.accept_callback;
    }
    if (obj?.reject_callback) {
      this.reject_callback = obj.reject_callback;
    }

    this.overlay.show(AcceptStakeTemplate(this.app, this.mod, obj));
    this.overlay.blockClose('#enable_staking_yes');
    this.attachEvents(obj);
  }

  attachEvents(obj) {
    document.querySelector('#enable_staking_yes').onclick = async (e) => {
      if (await this.mod.validateBalance(obj.stake, obj.ticker)) {
        if (this.accept_callback) {
          this.accept_callback();
        }
        this.overlay.close();
      }
    };

    document.querySelector('#enable_staking_no').onclick = (e) => {
      if (this.reject_callback) {
        this.reject_callback();
      }
      this.overlay.close();
    };
  }
}

module.exports = AcceptStake;
