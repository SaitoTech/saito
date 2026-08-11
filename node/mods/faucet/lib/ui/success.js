const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SuccessTemplate = require('./success.template');

class Success {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.acquisitionMessageShown = false;
  }

  render(opts = {}) {
    this.mod.attachStyleSheets();
    const amountLabel =
      opts.amountLabel ||
      (opts.tx
        ? `${this.app.wallet.convertNolanToSaito(this.amountFromIssuance(opts.tx))} SAITO`
        : `${this.app.wallet.convertNolanToSaito(this.mod.amount)} SAITO`);

    this.overlay.show(SuccessTemplate(this.app, this.mod, { amountLabel }));
    this.attachEvents();
    this.showAcquisitionSiteMessageOnce();
  }

  close() {
    this.overlay.close();
  }

  amountFromIssuance(tx) {
    let total = 0n;
    const pk = this.mod.publicKey;
    if (!tx?.to || !pk) {
      return this.mod.amount;
    }
    for (const slip of tx.to) {
      if (slip.publicKey === pk) {
        try {
          total += BigInt(slip.amount || 0);
        } catch (err) {
          // ignore malformed slip amounts
        }
      }
    }
    return total > 0n ? total : this.mod.amount;
  }

  showAcquisitionSiteMessageOnce() {
    if (this.acquisitionMessageShown) {
      return;
    }
    this.acquisitionMessageShown = true;
    siteMessage('Your SAITO is now in your wallet. Please continue.', 5000);
  }

  attachEvents() {
    const btn = document.querySelector('.success .saito-button-primary');
    if (btn) {
      btn.onclick = () => {
        this.mod.waiting_overlay.close();
        this.close();
        this.mod.auth_overlay.close();

        try {
          const purchase = this.app.modules.returnModule('BuySaito')?.purchase_overlay;
          if (purchase && typeof purchase.close === 'function') {
            purchase.close();
          }
        } catch (err) {
          console.error('FAUCET: failed to close BuySaito overlay', err);
        }
      };
    }
  }
}

module.exports = Success;
