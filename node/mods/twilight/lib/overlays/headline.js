const HeadlineTemplate = require('./headline.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class HeadlineOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    this.cards = null;
    this.title = null;

    this.overlay = new SaitoOverlay(app, mod, true, false, true);
  }

  render(uscard, ussrcard) {
    this.overlay.show(
      HeadlineTemplate(this.mod.returnCardImage(uscard), this.mod.returnCardImage(ussrcard))
    );
    this.attachEvents();
  }

  attachEvents() {
    if (this._onKey) {
      document.removeEventListener('keydown', this._onKey);
    }
    if (this._onMouse) {
      document.removeEventListener('mousedown', this._onMouse);
    }
    this._onKey = (e) => {
      if (e.key !== 'Enter' && e.key !== 'Escape' && e.key !== ' ' && e.key !== 'Spacebar' && e.key !== 'Backspace') {
        return;
      }
      e.preventDefault();
      this.overlay.hide();
    };
    this._onMouse = (e) => {
      if (e.button !== 3) {
        return;
      }
      e.preventDefault();
      this.overlay.hide();
    };
    document.addEventListener('keydown', this._onKey);
    document.addEventListener('mousedown', this._onMouse);
    this.overlay.callback_on_close = () => {
      if (this._onKey) {
        document.removeEventListener('keydown', this._onKey);
        this._onKey = null;
      }
      if (this._onMouse) {
        document.removeEventListener('mousedown', this._onMouse);
        this._onMouse = null;
      }
    };
  }
}

module.exports = HeadlineOverlay;
