const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');
const Template = require('./bug-editor.template');

class BugEditor {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false, true);
  }

  open(mode, values = {}) {
    return new Promise((resolve) => {
      const contentAvailable = this.mod.redsquare.available('composeRoot');
      // The editor can be launched from RedSquare before the Bugs page has
      // rendered, so its module styles are not otherwise attached in this tab.
      this.mod.attachStyleSheets();
      this.overlay.show(Template(mode, values, contentAvailable));
      const form = document.querySelector('.bugs-editor-form');
      const cancel = document.querySelector('.bugs-editor-cancel');

      const finish = (value) => {
        this.overlay.close();
        resolve(value);
      };
      cancel.onclick = () => finish(null);
      form.onsubmit = async (event) => {
        event.preventDefault();
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        const data = Object.fromEntries(new FormData(form).entries());
        try {
          let result;
          if (mode === 'create') result = await this.mod.createBugFromComposer(data);
          else if (mode === 'capture') result = await this.mod.captureTweet(values, data);
          else result = await this.mod.updateBugFields(values.root_tx_sig, values, data);
          finish(result);
        } catch (err) {
          button.disabled = false;
          this.mod.showError(err);
        }
      };
    });
  }
}

module.exports = BugEditor;
