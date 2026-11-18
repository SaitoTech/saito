const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PremiumTemplate = require('./premium-downloads.template');

class PremiumDownloads {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.downloads = [];
    this.app.connection.on('wallet-updated', async () => {
      if (typeof this.app.wallet?.updateNFTList === 'function') {
        try {
          await this.app.wallet.updateNFTList();
        } catch (err) {}
      }
      this.refresh();
    });
  }

  owns_premium() {
    const nfts = this.app?.options?.wallet?.nfts;
    const extract = this.app?.wallet?.extractNFTType;
    if (!Array.isArray(nfts) || typeof extract !== 'function') {
      return false;
    }
    for (let i = 0; i < nfts.length; i++) {
      const type = extract.call(this.app.wallet, nfts[i]?.slip3?.utxo_key || '');
      if (type === PremiumTemplate.PREMIUM_TYPE) {
        return true;
      }
    }
    return false;
  }

  render() {
    const sidebar = document.querySelector('.saito-sidebar.left');
    const nav = sidebar?.querySelector('.popup-lesson-nav');
    if (!sidebar || !nav) {
      return;
    }
    sidebar.querySelector('.popup-premium')?.remove();
    nav.insertAdjacentHTML('beforebegin', PremiumTemplate.box(this.owns_premium()));
    this.attach_box_events();
  }

  refresh() {
    if (!document.querySelector('.popup-lesson-nav')) {
      return;
    }
    const open = this.overlay.visible;
    this.render();
    if (open) {
      this.open_overlay();
    }
  }

  attach_box_events() {
    const button = document.querySelector('.popup-premium-open');
    if (!button) {
      return;
    }
    button.onclick = () => {
      this.open_overlay();
    };
  }

  open_overlay() {
    this.overlay.show(PremiumTemplate.overlay(this.owns_premium(), this.downloads));
  }
}

module.exports = PremiumDownloads;
