const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const RequestTemplate = require('./request.template');

class RequestOverlay {
  constructor(app, mod, list) {
    this.app = app;
    this.mod = mod;
    this.list = list;
    this.overlay = new SaitoOverlay(app, mod);
    this.claim = null;
  }

  open(nft, claim) {
    this.claim = claim;
    this.nft = nft;
    this.overlay.show(RequestTemplate(this.app, claim));
    this.attachEvents();
  }

  attachEvents() {
    const form = document.querySelector('.redemption-request-form');
    if (!form) {
      return;
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      const result = document.querySelector('.redemption-request-result');
      const address = form.withdrawal_address.value.trim();
      const instructions = form.instructions.value.trim();
      if (!address) {
        if (result) {
          result.textContent = 'A withdrawal address is required.';
        }
        return;
      }
      form.querySelector('button').disabled = true;
      const response = await this.mod.submitRedemption(this.claim, {
        withdrawal_address: address,
        instructions
      });
      if (result) {
        result.textContent = response?.notice || 'The redemption server did not accept this request.';
      }
      form.querySelector('button').disabled = false;
      if (response?.result === 'pending' || response?.result === 'duplicate') {
        await this.list.load();
      }
    };
  }
}

module.exports = RequestOverlay;
