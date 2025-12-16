const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class AdvancedScriptOverlay {

  constructor(app, mod){
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  render() {
    const html = `
      <div class="scripting-overlay">
        <h2>Generate Advanced Script</h2>

        <label>Describe your logic</label>
        <textarea class="adv-script-input" placeholder="Example: AND (CHECKSIG) NOT (CHECKTIME AFTER 123456789)"></textarea>

        <div class="overlay-actions">
          <button class="adv-generate-btn">Generate</button>
          <button class="adv-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    this.overlay.show(html);
    this.attachEvents();
  }

  attachEvents() {
    document.querySelector('.adv-cancel-btn').onclick = () => {
      this.overlay.hide();
    };

    document.querySelector('.adv-generate-btn').onclick = () => {
      const input = document.querySelector('.adv-script-input').value.trim();
      if (!input) { return; }

      //
      // CALL THE NEW PARSER
      //
      const { script, witness } = this.mod.convertScriptDescriptionToScriptAndWitnessJSON(input);

      //
      // UPDATE EDITOR FIELDS
      //
      if (script) {
        document.querySelector('.ss-script').value = JSON.stringify(script, null, 2);
      }

      if (witness) {
        document.querySelector('.ss-witness').value = JSON.stringify(witness, null, 2);
      }

      // Re-evaluate after insertion
      try {
        this.mod.ui.evaluateScript();
        this.mod.ui.evaluateWitness();
      } catch (err) { }

      this.overlay.hide();

    };
  }
}

module.exports = AdvancedScriptOverlay;


