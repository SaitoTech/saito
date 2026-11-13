const CardTemplate = require('./card.template');

class CardUI {
  constructor(app, mod, container = '.tscardgen-sidebar') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.drawing = false;
    this.pending = false;
  }

  render() {
    const host = document.querySelector(this.container);
    if (!host) {
      return;
    }

    const existing = host.querySelector('.ts-card');
    const html = CardTemplate();

    if (existing) {
      this.app.browser.replaceElementBySelector(html, `${this.container} .ts-card`);
    } else {
      this.app.browser.addElementToSelector(html, this.container);
    }

    this.draw();

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => this.draw());
    }
  }

  canvas() {
    return document.querySelector(`${this.container} .ts-card-canvas`);
  }

  async draw() {
    if (this.drawing) {
      this.pending = true;
      return;
    }

    this.drawing = true;
    try {
      do {
        this.pending = false;
        const canvas = this.canvas();
        if (!canvas) {
          break;
        }
        await this.mod.card.paint(canvas);
      } while (this.pending);
    } finally {
      this.drawing = false;
    }
  }
}

module.exports = CardUI;
