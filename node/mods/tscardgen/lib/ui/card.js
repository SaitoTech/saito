const CardTemplate = require('./card.template');

class CardUI {
  constructor(app, mod, container = '.tscardgen-preview') {
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
    const html = CardTemplate({ download_name: this.mod.card.downloadName() });

    if (existing) {
      this.app.browser.replaceElementBySelector(html, `${this.container} .ts-card`);
    } else {
      this.app.browser.addElementToSelector(html, this.container);
    }

    this.attachEvents();
    this.draw();

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => this.draw());
    }
  }

  canvas() {
    return document.querySelector(`${this.container} .ts-card-canvas`);
  }

  downloadLink() {
    return document.querySelector(`${this.container} .ts-card-download`);
  }

  attachEvents() {
    const link = this.downloadLink();
    if (!link) {
      return;
    }

    link.onclick = (event) => {
      const canvas = this.canvas();
      if (!canvas) {
        event.preventDefault();
        return;
      }

      link.href = this.mod.card.toDataURL(canvas);
      link.download = this.mod.card.downloadName();
    };
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
        const link = this.downloadLink();
        if (link) {
          link.href = this.mod.card.toDataURL(canvas);
          link.download = this.mod.card.downloadName();
        }
      } while (this.pending);
    } finally {
      this.drawing = false;
    }
  }
}

module.exports = CardUI;
