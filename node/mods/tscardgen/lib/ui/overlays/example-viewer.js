const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ExampleViewerTemplate = require('./example-viewer.template');

class ExampleViewer {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.example = null;
    this.on_copy = null;
  }

  render(example) {
    this.example = example || null;
    if (!this.example) {
      return;
    }
    this.overlay.show(ExampleViewerTemplate(this.example));
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector('.tscardgen-example-viewer');
    if (!root || !this.example) {
      return;
    }

    root.querySelector('[data-action="close"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.overlay.remove();
    });

    root.querySelector('[data-action="copy"]')?.addEventListener('click', async (event) => {
      event.preventDefault();
      if (typeof this.on_copy === 'function') {
        await this.on_copy(this.example.code);
      }
    });
  }
}

module.exports = ExampleViewer;
