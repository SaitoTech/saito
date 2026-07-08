const ScriptingKeyTemplate = require('./scripting.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ScriptingKey {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.callback = null;
  }

  render() {
    this.overlay.show(ScriptingKeyTemplate(this.app, this.mod, this));
    setTimeout(() => this.attachEvents(), 25);
  }

  attachEvents() {
    try {
      document.getElementById('mint_scripting_key_btn').onclick = (e) => {
        if (!this.app.core?.scripting?.hash || this.callback == null) {
          salert('Core scripting is not available - cannot calculate access_hash locally...');
          return;
        }
        let scriptjson = document.querySelector('.create-nft-script-textarea').value;
        let access_hash = this.app.core.scripting.hash(scriptjson);
        this.callback({ access_hash: access_hash, access_script: scriptjson });
        this.overlay.remove();
      };
    } catch (err) {}
  }
}

module.exports = ScriptingKey;
