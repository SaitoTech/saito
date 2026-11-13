const ScoringTemplate = require('./scoring.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ScoringOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.region = 'europe';
    this.overlay = new SaitoOverlay(app, mod);
  }

  render(region = 'europe', obj = null) {
    this.overlay.show(ScoringTemplate(region, obj));

    let cardimg = this.mod.returnCardImage(region);
    let qs = '.scoring-overlay .card';
    let qobj = document.querySelector(qs);

    if (qobj) {
      qobj.innerHTML = '';
      this.app.browser.addElementToSelector(cardimg, qs);
    }

    for (let i = 0; i < obj.bonus.length; i++) {
      let name = obj.bonus[i].name;
      let desc = obj.bonus[i].desc;
      let side = obj.bonus[i].side;
      let icon = obj.bonus[i].icon;

      this.app.browser.addElementToSelector(
        `
	    <div class="scoring-event">
	      <div class="scoring-event-name">${name}</div>
	      <div class="scoring-event-icon"><img src="${icon}" /></div>
	      <div class="scoring-event-desc">${desc}</div>
	    </div>
	  `,
        `.scoring-event-grid`
      );
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

module.exports = ScoringOverlay;
