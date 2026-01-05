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
	let scripting_mod = this.app.modules.returnModule("Scripting");
	if (!scripting_mod || this.callback == null) { alert("No Scripting Module Installed - cannot calculate access_hash locally..."); }
	let scriptjson = document.querySelector('.create-nft-script-textarea').innerHTML;
	let access_hash = scripting_mod.hash(scriptjson);
	this.callback({ access_hash : access_hash , access_script : scriptjson });
	this.overlay.remove();
      };
    } catch (err) {}

  }

}

module.exports = ScriptingKey;

