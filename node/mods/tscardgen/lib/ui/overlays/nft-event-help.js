const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const NftEventHelpTemplate = require('./nft-event-help.template');

class NftEventHelp {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.info = null;
  }

  render(info = {}) {
    this.info = info || {};
    this.overlay.show(NftEventHelpTemplate(this.info));
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector('.tscardgen-nft-event-help');
    if (!root) {
      return;
    }

    root.querySelector('[data-action="close"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.overlay.remove();
    });

    root.querySelector('[data-action="copy"]')?.addEventListener('click', async (event) => {
      event.preventDefault();
      const text = String(this.info?.instruction || '');
      if (!text) {
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        if (typeof salert === 'function') {
          salert('Instruction copied');
        }
      } catch (err) {
        console.warn('TSCardGen: clipboard copy failed', err);
      }
    });
  }
}

module.exports = NftEventHelp;
