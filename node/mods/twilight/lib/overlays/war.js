const WarTemplate = require('./war.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class WarOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.war = 'indopaki';
    this.overlay = new SaitoOverlay(app, mod);
  }

  render(conflict = 'indopaki', obj = null) {
    this.overlay.show(WarTemplate(conflict, obj));

    let cardimg = this.mod.returnCardImage(conflict);
    let qs = '.war-overlay .card';
    let qobj = document.querySelector(qs);

    if (qobj) {
      qobj.innerHTML = '';
      this.app.browser.addElementToSelector(cardimg, qs);
    }

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

module.exports = WarOverlay;
